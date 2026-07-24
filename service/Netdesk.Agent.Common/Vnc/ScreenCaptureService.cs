using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// GDI-bazirano hvatanje ekrana (Graphics.CopyFromScreen) - najkompatibilnija
    /// opcija za .NET Framework 4.5.2 bez dodatnih paketa. DXGI Desktop
    /// Duplication API je efikasniji (hardversko dirty-rect praćenje) ali
    /// komplikovaniji - ostaje kao buduća optimizacija ako se pokaže da je GDI
    /// capture presporo/preskupo po CPU-u za ciljanih 2-3 FPS.
    /// </summary>
    public static class ScreenCaptureService
    {
        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        private const int SM_XVIRTUALSCREEN = 76;
        private const int SM_YVIRTUALSCREEN = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;

        /// <summary>
        /// Ceo virtuelni ekran (svi monitori zajedno), ne samo primarni -
        /// isti opseg koordinata koji InputInjector koristi za apsolutno
        /// pozicioniranje miša (MOUSEEVENTF_VIRTUALDESK).
        /// </summary>
        public static Rectangle GetVirtualScreenBounds()
        {
            return new Rectangle(
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN));
        }

        public static byte[] CaptureAsJpeg(int quality = 50)
        {
            var bounds = GetVirtualScreenBounds();

            using (var bitmap = new Bitmap(bounds.Width, bounds.Height))
            {
                using (var g = Graphics.FromImage(bitmap))
                {
                    g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                }

                return EncodeJpeg(bitmap, quality);
            }
        }

        private static byte[] EncodeJpeg(Bitmap bitmap, int quality)
        {
            var encoder = GetJpegEncoder();
            var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);

            using (var ms = new MemoryStream())
            {
                bitmap.Save(ms, encoder, encoderParams);
                return ms.ToArray();
            }
        }

        private static ImageCodecInfo GetJpegEncoder()
        {
            foreach (var codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.FormatID == ImageFormat.Jpeg.Guid)
                {
                    return codec;
                }
            }

            throw new InvalidOperationException("JPEG encoder nije pronađen na ovoj mašini.");
        }
    }
}
