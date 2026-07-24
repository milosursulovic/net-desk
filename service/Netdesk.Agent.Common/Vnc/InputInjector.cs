using System;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// Ubacivanje miša/tastature preko user32.dll!SendInput - standardan,
    /// dokumentovan Win32 API (isti mehanizam koji koriste legitimni
    /// remote-desktop alati), ne neka zaobilaznica.
    /// </summary>
    public static class InputInjector
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        private const int INPUT_MOUSE = 0;
        private const int INPUT_KEYBOARD = 1;

        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;

        private const uint KEYEVENTF_KEYUP = 0x0002;

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;

            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public int type;
            public InputUnion u;
        }

        public enum MouseButton
        {
            Left,
            Right,
            Middle,
        }

        /// <summary>
        /// xFraction/yFraction su 0.0-1.0, relativno prema celom snimljenom
        /// (virtuelnom) ekranu - dolaze od udaljenog viewer-a koji zna samo
        /// dimenzije prikazanog frame-a, ne stvarnu rezoluciju target mašine.
        /// MOUSEEVENTF_VIRTUALDESK već normalizuje 0-65535 preko CELOG
        /// virtuelnog desktopa (isti opseg koji ScreenCaptureService snima),
        /// pa se frakcija direktno preslikava bez potrebe za ručnim
        /// računanjem granica ekrana.
        /// </summary>
        public static void MoveMouseAbsolute(double xFraction, double yFraction)
        {
            var absX = (int)(Clamp01(xFraction) * 65535);
            var absY = (int)(Clamp01(yFraction) * 65535);

            SendMouseInput(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK);
        }

        public static void MouseButtonEvent(MouseButton button, bool isDown)
        {
            uint flag;
            switch (button)
            {
                case MouseButton.Right:
                    flag = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                    break;
                case MouseButton.Middle:
                    flag = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
                    break;
                default:
                    flag = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
                    break;
            }

            SendMouseInput(0, 0, 0, flag);
        }

        public static void MouseWheel(int delta)
        {
            SendMouseInput(0, 0, unchecked((uint)delta), MOUSEEVENTF_WHEEL);
        }

        public static void KeyEvent(ushort vkCode, bool isDown)
        {
            var input = new INPUT
            {
                type = INPUT_KEYBOARD,
                u = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vkCode,
                        wScan = 0,
                        dwFlags = isDown ? 0 : KEYEVENTF_KEYUP,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero,
                    },
                },
            };

            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        private static double Clamp01(double v)
        {
            if (v < 0) return 0;
            if (v > 1) return 1;
            return v;
        }

        private static void SendMouseInput(int dx, int dy, uint mouseData, uint flags)
        {
            var input = new INPUT
            {
                type = INPUT_MOUSE,
                u = new InputUnion
                {
                    mi = new MOUSEINPUT
                    {
                        dx = dx,
                        dy = dy,
                        mouseData = mouseData,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero,
                    },
                },
            };

            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }
    }
}
