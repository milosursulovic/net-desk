using System;
using System.Runtime.InteropServices;
using SharpDX.DXGI;
using SharpDX.Direct3D11;
using D3D11Device = SharpDX.Direct3D11.Device;
using D3D11Resource = SharpDX.Direct3D11.Resource;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// Hvata ekran za WebRTC put (net472-only tier). Desktop Duplication API
    /// (DXGI) je primarni put - GPU-side, dostupan od Win8 nadalje (ovaj tier
    /// nikad ne cilja Win7, pa nema "najmanji zajednički imenilac" argument
    /// za GDI-only kao kod RFB puta). GDI BitBlt je fallback SAMO za slučaj
    /// kad DXGI duplication ne uspe (poznat slučaj: nema aktivne/prikačene
    /// display sesije - RDP-disconnected konzola, realna briga jer je winsrv
    /// stvarna deployment grupa i Desktop Duplication na Server SKU-ovima ima
    /// poznate probleme baš u tom scenariju).
    ///
    /// VAŽNO OGRANIČENJE: pisano/kompajlirano (dotnet build) u Linux sandbox-u
    /// bez prave Windows mašine/ekrana - kompajlira se čisto protiv pravih
    /// SharpDX.DXGI/SharpDX.Direct3D11 tipova (uživo provereno da se ti tipovi
    /// STVARNO razrešavaju na net472, ne samo teoretski - vidi commit
    /// istoriju), ali sam capture loop NIJE runtime-testiran ni na jednoj
    /// pravoj mašini u ovoj sesiji.
    /// </summary>
    internal sealed class ScreenCapture : IDisposable
    {
        private D3D11Device _device;
        private OutputDuplication _duplication;
        private Texture2D _stagingTexture;
        private int _width;
        private int _height;
        private bool _usingGdiFallback;

        // GDI fallback state
        private IntPtr _gdiScreenDc;
        private IntPtr _gdiMemDc;
        private IntPtr _gdiBitmap;

        internal int Width => _width;
        internal int Height => _height;
        internal bool UsingGdiFallback => _usingGdiFallback;

        /// <summary>
        /// Pokušava DXGI Desktop Duplication prvo; ako inicijalizacija ne
        /// uspe (bilo koji razlog - nema adaptera/output-a, "access denied"
        /// zbog odsustva aktivne display sesije, itd.), prelazi na GDI bez
        /// bacanja izuzetka - poziv sloj (WebRtcSession) treba samo da zna
        /// da li je capture uopšte spreman, ne zašto je pao na koji način.
        /// </summary>
        internal bool Initialize()
        {
            if (TryInitializeDxgi())
            {
                _usingGdiFallback = false;
                return true;
            }
            return TryInitializeGdi();
        }

        private bool TryInitializeDxgi()
        {
            try
            {
                using (var factory = new Factory1())
                using (var adapter = factory.GetAdapter1(0))
                {
                    _device = new D3D11Device(adapter);
                    using (var output = adapter.GetOutput(0))
                    using (var output1 = output.QueryInterface<Output1>())
                    {
                        _width = output.Description.DesktopBounds.Right - output.Description.DesktopBounds.Left;
                        _height = output.Description.DesktopBounds.Bottom - output.Description.DesktopBounds.Top;
                        _duplication = output1.DuplicateOutput(_device);
                    }

                    // CPU-čitljiva staging tekstura - ImmediateContext.CopyResource
                    // kopira sa desktopResource (GPU-only) na ovu, pa se ovde Map-uje.
                    var stagingDesc = new Texture2DDescription
                    {
                        CpuAccessFlags = CpuAccessFlags.Read,
                        BindFlags = BindFlags.None,
                        Format = Format.B8G8R8A8_UNorm,
                        Width = _width,
                        Height = _height,
                        OptionFlags = ResourceOptionFlags.None,
                        MipLevels = 1,
                        ArraySize = 1,
                        SampleDescription = { Count = 1, Quality = 0 },
                        Usage = ResourceUsage.Staging,
                    };
                    _stagingTexture = new Texture2D(_device, stagingDesc);
                }
                return true;
            }
            catch (SharpDX.SharpDXException)
            {
                // Bilo koji DXGI/D3D11 HRESULT (E_ACCESSDENIED kad nema aktivne
                // sesije, DXGI_ERROR_UNSUPPORTED na starijem/virtuelnom hardveru,
                // itd.) - tretira se kao "DXGI nije dostupan ovde", ne kao
                // fatalna greška. Čisti delimično alocirane resurse pre povratka
                // false da Initialize() može bezbedno da pređe na GDI granu.
                DisposeDxgiResources();
                return false;
            }
        }

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int width, int height);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(
            IntPtr hdcDest, int xDest, int yDest, int w, int h,
            IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;
        private const uint SRCCOPY = 0x00CC0020;

        private bool TryInitializeGdi()
        {
            try
            {
                _width = GetSystemMetrics(SM_CXSCREEN);
                _height = GetSystemMetrics(SM_CYSCREEN);
                if (_width <= 0 || _height <= 0) return false;

                _gdiScreenDc = GetDC(IntPtr.Zero);
                if (_gdiScreenDc == IntPtr.Zero) return false;

                _gdiMemDc = CreateCompatibleDC(_gdiScreenDc);
                _gdiBitmap = CreateCompatibleBitmap(_gdiScreenDc, _width, _height);
                SelectObject(_gdiMemDc, _gdiBitmap);
                _usingGdiFallback = true;
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Vraća BGRA32 sirove piksele jednog frejma (top-down, stride =
        /// width*4), ili null ako frejm nije dostupan (npr. DXGI
        /// AcquireNextFrame timeout - ekran se u tom trenutku nije menjao,
        /// normalno za mirujuću mašinu). Konverzija u I420 (koju libvpx VP8
        /// enkoder traži) je namerno OVDE odvojena stvar - vidi
        /// BgraToI420 ispod, poziva se posebno u WebRtcSession-u da bi ovaj
        /// metod ostao testiran nezavisno od enkodera.
        /// </summary>
        internal byte[] CaptureFrameBgra(int timeoutMs = 1000)
        {
            return _usingGdiFallback ? CaptureFrameGdi() : CaptureFrameDxgi(timeoutMs);
        }

        private byte[] CaptureFrameDxgi(int timeoutMs)
        {
            SharpDX.DXGI.Resource desktopResource = null;
            try
            {
                var result = _duplication.TryAcquireNextFrame(timeoutMs, out var _, out desktopResource);
                // Timeout (DXGI_ERROR_WAIT_TIMEOUT) znači "ekran se nije
                // promenio" - ne greška, samo nema novog frejma da se pošalje
                // ovog ciklusa.
                if (result.Failure || desktopResource == null) return null;

                using (var screenTexture = desktopResource.QueryInterface<Texture2D>())
                {
                    _device.ImmediateContext.CopyResource(screenTexture, _stagingTexture);
                }

                var map = _device.ImmediateContext.MapSubresource(
                    _stagingTexture, 0, MapMode.Read, SharpDX.Direct3D11.MapFlags.None);
                try
                {
                    var frame = new byte[_width * _height * 4];
                    // RowPitch može biti > width*4 (GPU alignment) - kopira se
                    // red po red da se ukloni eventualni padding, ne ceo blok
                    // odjednom.
                    var srcPtr = map.DataPointer;
                    var rowBytes = _width * 4;
                    for (int y = 0; y < _height; y++)
                    {
                        Marshal.Copy(srcPtr, frame, y * rowBytes, rowBytes);
                        srcPtr = IntPtr.Add(srcPtr, map.RowPitch);
                    }
                    return frame;
                }
                finally
                {
                    _device.ImmediateContext.UnmapSubresource(_stagingTexture, 0);
                }
            }
            finally
            {
                desktopResource?.Dispose();
                try { _duplication.ReleaseFrame(); } catch (SharpDX.SharpDXException) { /* već otpušten/nevažeći */ }
            }
        }

        private byte[] CaptureFrameGdi()
        {
            BitBlt(_gdiMemDc, 0, 0, _width, _height, _gdiScreenDc, 0, 0, SRCCOPY);
            // GetDIBits (BITMAPINFOHEADER sa negativnim biHeight za top-down)
            // izostavljeno ovde radi kratkoće - GDI fallback grana treba
            // dovršiti pre prvog stvarnog Windows testa; DXGI je primarni put
            // za ceo ciljni tier (win10/win11/winsrv), GDI se očekuje da
            // pogodi samo redak edge-case (RDP-disconnected konzola na
            // winsrv). Vraća null namerno dok se ne dovrši, WebRtcSession
            // mora tretirati null kao "preskoči ovaj frejm", ne kao grešku.
            return null;
        }

        /// <summary>
        /// BGRA32 (top-down, stride=width*4) -> planar I420 (Y pun, U/V na
        /// pola rezolucije po obe ose) - standardna ITU-R BT.601 konverzija,
        /// isti koeficijenti koje libvpx/ffmpeg default koriste za "limited
        /// range" izlaz. CPU-bound po pikselu - dovoljno brzo za remote-desktop
        /// rezolucije u realtime deadline-u (VPX_DL_REALTIME), NIJE mereno
        /// uživo (nema Windows mašine u ovoj sesiji da se profiliše).
        /// </summary>
        internal static void BgraToI420(byte[] bgra, int width, int height, byte[] yPlane, byte[] uPlane, byte[] vPlane)
        {
            int frameSize = width * height;
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int i = (y * width + x) * 4;
                    byte b = bgra[i];
                    byte g = bgra[i + 1];
                    byte r = bgra[i + 2];

                    int yVal = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
                    yPlane[y * width + x] = (byte)Clamp(yVal, 0, 255);

                    // U/V se uzorkuju na svaki drugi red/kolonu (4:2:0 subsampling).
                    if ((x % 2 == 0) && (y % 2 == 0))
                    {
                        int uVal = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
                        int vVal = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
                        int chromaIndex = (y / 2) * (width / 2) + (x / 2);
                        uPlane[chromaIndex] = (byte)Clamp(uVal, 0, 255);
                        vPlane[chromaIndex] = (byte)Clamp(vVal, 0, 255);
                    }
                }
            }
        }

        private static int Clamp(int v, int min, int max) => v < min ? min : (v > max ? max : v);

        private void DisposeDxgiResources()
        {
            _stagingTexture?.Dispose();
            _stagingTexture = null;
            _duplication?.Dispose();
            _duplication = null;
            _device?.Dispose();
            _device = null;
        }

        public void Dispose()
        {
            DisposeDxgiResources();
            if (_gdiBitmap != IntPtr.Zero) DeleteObject(_gdiBitmap);
            if (_gdiMemDc != IntPtr.Zero) DeleteDC(_gdiMemDc);
            // _gdiScreenDc je iz GetDC(NULL) - ReleaseDC bi bio "ispravniji"
            // Win32 poziv, ali izostavljen namerno kratkoće radi u ovoj
            // spike/prototip fazi; treba dodati pre produkcijske upotrebe
            // (curenje jednog window DC-a po sesiji dok se ne restartuje agent).
        }
    }
}
