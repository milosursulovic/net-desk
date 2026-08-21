using System;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// SendInput-bazirana injekcija miša/tastature - namenjeno da se izvršava
    /// UNUTAR helper procesa koji SessionLauncher pokrene u interaktivnoj
    /// korisničkoj sesiji, NIKAD direktno iz Netdesk.Agent.Service (Session 0,
    /// vidi opsežnu napomenu u SessionLauncher.cs - SendInput iz Session 0
    /// ne stiže nigde). Koordinate su normalizovane [0,1] (isto što
    /// RTCDataChannel poruke sa browser strane nose - klijent zna svoju
    /// canvas/video element rezoluciju, agent zna stvarnu rezoluciju ekrana
    /// preko ScreenCapture.Width/Height, pa se skaliranje radi ovde).
    ///
    /// NIJE runtime testirano (nema Windows mašine u ovoj sesiji).
    /// </summary>
    internal static class InputInjector
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput
        {
            public int Dx, Dy;
            public uint MouseData, Flags, Time;
            public IntPtr ExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KeybdInput
        {
            public ushort Vk, Scan;
            public uint Flags, Time;
            public IntPtr ExtraInfo;
        }

        // INPUT je union (MOUSEINPUT/KEYBDINPUT/HARDWAREINPUT) - najveća
        // varijanta (MOUSEINPUT, 28B na x64) određuje veličinu union dela.
        // Type-tag (0=mouse, 1=keyboard, 2=hardware) ide PRE unije.
        [StructLayout(LayoutKind.Explicit)]
        private struct Input
        {
            [FieldOffset(0)] public uint Type;
            [FieldOffset(8)] public MouseInput Mouse;
            [FieldOffset(8)] public KeybdInput Keyboard;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint numInputs, Input[] inputs, int structSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        private const uint INPUT_MOUSE = 0;
        private const uint INPUT_KEYBOARD = 1;

        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_SCANCODE = 0x0008;

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;

        /// <summary>
        /// normX/normY su [0,1] preko cele virtuelne ekranske površine.
        /// MOUSEEVENTF_ABSOLUTE traži koordinate skalirane na 0-65535 opseg
        /// (dokumentovano Win32 ponašanje - "absolute" mišje koordinate su
        /// UVEK u ovom fiksnom opsegu, ne u pikselima).
        /// </summary>
        internal static void MoveMouse(double normX, double normY)
        {
            var input = new Input
            {
                Type = INPUT_MOUSE,
                Mouse = new MouseInput
                {
                    Dx = (int)(normX * 65535),
                    Dy = (int)(normY * 65535),
                    Flags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                },
            };
            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input)));
        }

        internal enum MouseButton { Left, Right, Middle }

        internal static void MouseButtonEvent(MouseButton button, bool down)
        {
            // Obican switch statement, ne switch expression - LangVersion je
            // fiksiran na 7.3 (deljeno izmedju net452/net472 u csproj-u, radi
            // Win7-kompatibilnog kompajlera na net452 strani), switch
            // expression je C# 8+ feature.
            uint flags;
            switch (button)
            {
                case MouseButton.Left:
                    flags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
                    break;
                case MouseButton.Right:
                    flags = down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                    break;
                case MouseButton.Middle:
                    flags = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
                    break;
                default:
                    flags = 0;
                    break;
            }
            if (flags == 0) return;
            var input = new Input { Type = INPUT_MOUSE, Mouse = new MouseInput { Flags = flags } };
            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input)));
        }

        internal static void MouseWheel(int delta)
        {
            var input = new Input
            {
                Type = INPUT_MOUSE,
                Mouse = new MouseInput { Flags = MOUSEEVENTF_WHEEL, MouseData = unchecked((uint)delta) },
            };
            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input)));
        }

        /// <summary>
        /// scanCode je hardverski (PS/2 Set 1-stil) scan code, ne virtuelni
        /// key kod - RTCDataChannel poruke sa browser strane treba da nose
        /// ovo (KeyboardEvent.code se mapira na scan code na frontend strani,
        /// van dosega ovog fajla), ne KeyboardEvent.key/keyCode koji su
        /// layout-zavisni. extended MORA biti true za strelice/Insert/
        /// Delete/Home/End/PageUp/PageDown/desni Ctrl-Alt/numpad Enter-Divide
        /// - bez KEYEVENTF_EXTENDEDKEY flag-a, SendInput tumači isti scan
        /// code kao numpad varijantu tog tastera umesto namenjenog
        /// (dokumentovano Win32 ponašanje, ne proizvoljan izbor ovde).
        /// </summary>
        internal static void KeyEvent(ushort scanCode, bool down, bool extended = false)
        {
            uint flags = KEYEVENTF_SCANCODE | (down ? 0u : KEYEVENTF_KEYUP) | (extended ? KEYEVENTF_EXTENDEDKEY : 0u);
            var input = new Input
            {
                Type = INPUT_KEYBOARD,
                Keyboard = new KeybdInput { Scan = scanCode, Flags = flags },
            };
            SendInput(1, new[] { input }, Marshal.SizeOf(typeof(Input)));
        }
    }
}
