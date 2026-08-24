using System;
using System.Runtime.InteropServices;
using NetdeskAgent.Common.Logging;
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
    ///
    /// NAPOMENA (crn ekran, prvi uživo test): GDI fallback grana je prvobitno
    /// bila ostavljena kao stub koji uvek vraća null (BitBlt bez GetDIBits) -
    /// ako je DXGI iz bilo kog razloga tiho pao na inicijalizaciji, ceo
    /// capture bi zauvek vraćao null bez ijednog loga (WebRtcSession null
    /// tretira kao "nema promene ovog ciklusa", ne kao grešku), što izgleda
    /// identično kao "konekcija radi, ali ekran ostaje crn". GetDIBits je
    /// sad implementiran; Start() u WebRtcSession.cs takođe sad loguje koji
    /// put (DXGI/GDI) je stvarno aktivan da se ovo ubuduće odmah vidi iz loga.
    /// </summary>
    internal sealed class ScreenCapture : IDisposable
    {
        // Vidi napomenu uz DuplicateOutput poziv u TryInitializeDxgi() -
        // DXGI_ERROR_NOT_CURRENTLY_AVAILABLE je dokumentovano prolazan.
        private const int DuplicateOutputMaxAttempts = 5;
        private const int DuplicateOutputRetryDelayMs = 300;

        private D3D11Device _device;
        private OutputDuplication _duplication;
        private Texture2D _stagingTexture;
        private int _width;
        private int _height;
        private bool _usingGdiFallback;

        private bool _gdiFailureLogged;

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
            Adapter1 chosenAdapter = null;
            Output1 chosenOutput1 = null;
            try
            {
                using (var factory = new Factory1())
                {
                    // Traži prvo output koji prijavljuje IsAttachedToDesktop
                    // (korisno na mašinama sa više adaptera - integrisana +
                    // diskretna grafika - gde adapter 0 nije nužno onaj koji
                    // renderuje desktop). NIJE strogo obavezno: uživo test je
                    // pokazao IsAttachedToDesktop=false za JEDINI stvarni
                    // output na mašini (adapterCount=2 - adapter 0 je
                    // "Microsoft Basic Render Driver" sa NULA output-a,
                    // pravi Intel adapter je na indexu 1), iako je desktop
                    // očigledno aktivan i vidljiv - to polje nije pouzdano na
                    // ovoj drajver/SharpDX kombinaciji. Zato se usput čuva i
                    // "any" kandidat - prvi output nađen bilo gde, kroz SVE
                    // adaptere (ne samo adapter 0, koji ovde nema nijedan
                    // output) - kao rezerva ako nijedan output ne prijavi
                    // attached.
                    Adapter1 anyAdapter = null;
                    Output1 anyOutput1 = null;
                    int anyWidth = 0, anyHeight = 0;

                    var adapterCount = factory.GetAdapterCount1();
                    for (int a = 0; a < adapterCount && chosenOutput1 == null; a++)
                    {
                        var adapter = factory.GetAdapter1(a);
                        var outputCount = adapter.GetOutputCount();
                        // Detaljan log po adapteru (ime + broj output-a) - dosadašnji
                        // pokušaji nagađanja koji je adapter "pravi" su bili pogrešni
                        // (IsAttachedToDesktop nepouzdano, adapter 0 nije uvek prazan
                        // WARP/Basic Render adapter), pa je vreme za tvrde podatke
                        // umesto sledeće pretpostavke.
                        FileLogger.Info("DXGI adapter[" + a + "]: \"" + adapter.Description1.Description +
                            "\", outputCount=" + outputCount);
                        var keepAsChosen = false;
                        var keepAsAny = false;
                        for (int o = 0; o < outputCount; o++)
                        {
                            using (var output = adapter.GetOutput(o))
                            {
                                if (output.Description.IsAttachedToDesktop)
                                {
                                    _width = output.Description.DesktopBounds.Right - output.Description.DesktopBounds.Left;
                                    _height = output.Description.DesktopBounds.Bottom - output.Description.DesktopBounds.Top;
                                    chosenOutput1 = output.QueryInterface<Output1>();
                                    keepAsChosen = true;
                                    break;
                                }
                                if (anyOutput1 == null)
                                {
                                    anyWidth = output.Description.DesktopBounds.Right - output.Description.DesktopBounds.Left;
                                    anyHeight = output.Description.DesktopBounds.Bottom - output.Description.DesktopBounds.Top;
                                    anyOutput1 = output.QueryInterface<Output1>();
                                    keepAsAny = true;
                                }
                            }
                        }
                        if (keepAsChosen) chosenAdapter = adapter;
                        else if (keepAsAny) anyAdapter = adapter;
                        else adapter.Dispose();
                    }

                    if (chosenAdapter == null && anyAdapter != null)
                    {
                        chosenAdapter = anyAdapter;
                        chosenOutput1 = anyOutput1;
                        _width = anyWidth;
                        _height = anyHeight;
                    }
                    else
                    {
                        anyOutput1?.Dispose();
                        anyAdapter?.Dispose();
                    }

                    if (chosenAdapter == null || chosenOutput1 == null)
                    {
                        FileLogger.Warn("DXGI Desktop Duplication init: nijedan adapter/output nije pronađen (adapterCount=" + adapterCount + ").");
                        return false;
                    }

                    _device = new D3D11Device(chosenAdapter);

                    // DXGI_ERROR_NOT_CURRENTLY_AVAILABLE je po zvaničnoj MSDN
                    // dokumentaciji za DuplicateOutput OČEKIVANO prolazna
                    // greška (npr. odmah po pokretanju procesa dok se
                    // desktop/compositor još "ne slegne", ili tokom kratkog
                    // desktop prelaza) - uživo test je DOSLEDNO hvatao baš
                    // ovaj HRESULT, uvek u istoj milisekundi kad proces kreće,
                    // na potpuno aktivnoj/nezaključanoj/fizički-za-mašinom
                    // sesiji. Zvanično preporučen lek je ponovni pokušaj
                    // posle kratke pauze, ne odmah odustajanje na GDI.
                    for (int attempt = 1; attempt <= DuplicateOutputMaxAttempts; attempt++)
                    {
                        try
                        {
                            _duplication = chosenOutput1.DuplicateOutput(_device);
                            break;
                        }
                        catch (SharpDX.SharpDXException) when (attempt < DuplicateOutputMaxAttempts)
                        {
                            System.Threading.Thread.Sleep(DuplicateOutputRetryDelayMs);
                        }
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
            catch (SharpDX.SharpDXException ex)
            {
                // Bilo koji DXGI/D3D11 HRESULT (E_ACCESSDENIED kad nema aktivne
                // sesije, DXGI_ERROR_UNSUPPORTED na starijem/virtuelnom hardveru,
                // itd.) - tretira se kao "DXGI nije dostupan ovde", ne kao
                // fatalna greška. Čisti delimično alocirane resurse pre povratka
                // false da Initialize() može bezbedno da pređe na GDI granu.
                // HResult/poruka se ipak loguje (samo ovde, ne po frejmu) - bez
                // ovoga je nemoguće razlikovati "nema display sesije uopšte"
                // od "GPU/drajver ne podržava Desktop Duplication" od bilo
                // kog drugog HRESULT-a, a to direktno određuje da li je ovo
                // uopšte popravljivo iz koda ili je ograničenje mašine.
                FileLogger.Warn("DXGI Desktop Duplication init neuspešan (HResult=0x" +
                    ex.HResult.ToString("X8") + "): " + ex.Message);
                DisposeDxgiResources();
                return false;
            }
            finally
            {
                // chosenOutput1/chosenAdapter se ne drže dugoročno - D3D11Device
                // i IDXGIOutputDuplication (_device/_duplication) drže sopstvene
                // COM reference, isti životni vek kao u originalnom using-based
                // kodu koji je odmah nakon kreiranja device/duplication oslobađao
                // adapter/output.
                chosenOutput1?.Dispose();
                chosenAdapter?.Dispose();
            }
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int index);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int width, int height);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern bool BitBlt(
            IntPtr hdcDest, int xDest, int yDest, int w, int h,
            IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern int GetDIBits(
            IntPtr hdc, IntPtr hbmp, uint uStartScan, uint cScanLines,
            [Out] byte[] lpvBits, ref BitmapInfoHeader lpbi, uint uUsage);

        [StructLayout(LayoutKind.Sequential)]
        private struct BitmapInfoHeader
        {
            public uint biSize;
            public int biWidth;
            public int biHeight;
            public short biPlanes;
            public short biBitCount;
            public uint biCompression;
            public uint biSizeImage;
            public int biXPelsPerMeter;
            public int biYPelsPerMeter;
            public uint biClrUsed;
            public uint biClrImportant;
        }

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;
        private const uint SRCCOPY = 0x00CC0020;
        private const uint BI_RGB = 0;
        private const uint DIB_RGB_COLORS = 0;

        private bool TryInitializeGdi()
        {
            try
            {
                _width = GetSystemMetrics(SM_CXSCREEN);
                _height = GetSystemMetrics(SM_CYSCREEN);
                if (_width <= 0 || _height <= 0) return false;

                // Samo smoke-test da GDI uopšte može da dobije screen DC ovde
                // - stvarni handle-ovi za BitBlt/GetDIBits se dobijaju iznova
                // na SVAKOM frejmu u CaptureFrameGdi(), na thread-u koji ih
                // stvarno koristi (vidi napomenu tamo: uživo test je pokazao
                // BitBlt ERROR_INVALID_HANDLE kad su handle-ovi keširani ovde
                // - na WS message thread-u - pa korišćeni kasnije sa
                // CaptureLoop-ovog Task.Run thread-a; GetDC-ov "common" DC
                // keš nije pouzdano deljiv preko granice niti).
                var screenDc = GetDC(IntPtr.Zero);
                if (screenDc == IntPtr.Zero)
                {
                    FileLogger.Warn("GDI fallback init: GetDC(NULL) neuspešan, GetLastError=" + Marshal.GetLastWin32Error());
                    return false;
                }
                ReleaseDC(IntPtr.Zero, screenDc);

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

        // Svi GDI handle-ovi (screen DC, mem DC, bitmap) se dobijaju i
        // oslobađaju OVDE, u okviru jednog poziva, na thread-u koji stvarno
        // radi capture (CaptureLoop-ov Task.Run thread) - ne kešira se ništa
        // iz TryInitializeGdi() (koja se izvršava na Start()-ovom thread-u).
        // Uživo test je pokazao BitBlt ERROR_INVALID_HANDLE baš u tom
        // keširanom-preko-niti scenariju; GetDC-ov "common" DC keš nije
        // pouzdano deljiv preko granice niti. Malo skuplje po frejmu
        // (create/delete DC+bitmap 15x/s) nego keširanje, ali GDI je već
        // samo redak fallback put, ne primarni.
        private byte[] CaptureFrameGdi()
        {
            var screenDc = GetDC(IntPtr.Zero);
            if (screenDc == IntPtr.Zero)
            {
                LogGdiFailureOnce("GetDC(NULL) neuspešan, GetLastError=" + Marshal.GetLastWin32Error());
                return null;
            }
            try
            {
                var memDc = CreateCompatibleDC(screenDc);
                if (memDc == IntPtr.Zero)
                {
                    LogGdiFailureOnce("CreateCompatibleDC neuspešan, GetLastError=" + Marshal.GetLastWin32Error());
                    return null;
                }
                try
                {
                    var bitmap = CreateCompatibleBitmap(screenDc, _width, _height);
                    if (bitmap == IntPtr.Zero)
                    {
                        LogGdiFailureOnce("CreateCompatibleBitmap neuspešan, GetLastError=" + Marshal.GetLastWin32Error());
                        return null;
                    }
                    try
                    {
                        SelectObject(memDc, bitmap);

                        // Marshal.GetLastWin32Error() (ne ručni kernel32!GetLastError
                        // p/invoke) - mora se čitati odmah posle p/invoke poziva koji
                        // ima SetLastError=true, jer CLR marshaling kod između dva
                        // odvojena p/invoke poziva može da pregazi pravu vrednost.
                        if (!BitBlt(memDc, 0, 0, _width, _height, screenDc, 0, 0, SRCCOPY))
                        {
                            LogGdiFailureOnce("BitBlt neuspešan, GetLastError=" + Marshal.GetLastWin32Error());
                            return null;
                        }

                        // biHeight negativan = top-down DIB (isti red-po-red
                        // raspored koji CaptureFrameDxgi/BgraToI420 već
                        // očekuju) - bez ovoga GetDIBits vraća bottom-up i
                        // slika bi bila naopako, ne crna, ali ipak pogrešna.
                        var header = new BitmapInfoHeader
                        {
                            biSize = (uint)Marshal.SizeOf(typeof(BitmapInfoHeader)),
                            biWidth = _width,
                            biHeight = -_height,
                            biPlanes = 1,
                            biBitCount = 32,
                            biCompression = BI_RGB,
                        };

                        var buffer = new byte[_width * _height * 4];
                        var scanLines = GetDIBits(memDc, bitmap, 0, (uint)_height, buffer, ref header, DIB_RGB_COLORS);
                        if (scanLines == 0)
                        {
                            LogGdiFailureOnce("GetDIBits neuspešan (vratio 0 scan-linija), GetLastError=" + Marshal.GetLastWin32Error());
                            return null;
                        }
                        return buffer;
                    }
                    finally
                    {
                        DeleteObject(bitmap);
                    }
                }
                finally
                {
                    DeleteDC(memDc);
                }
            }
            finally
            {
                ReleaseDC(IntPtr.Zero, screenDc);
            }
        }

        // Loguje se samo prvi put - na ~15 FPS bi ponavljanje na svaki frejm
        // zatrpalo log bez nove informacije (isti obrazac kao
        // WebRtcSession._loggedFirstCaptureError).
        private void LogGdiFailureOnce(string detail)
        {
            if (_gdiFailureLogged) return;
            _gdiFailureLogged = true;
            FileLogger.Warn("GDI capture frejm neuspešan (dalja ponavljanja se ne loguju): " + detail);
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
            // GDI grana više ne drži nijedan dugotrajan handle - svaki DC/
            // bitmap se dobija i oslobađa unutar CaptureFrameGdi() poziva,
            // ništa ovde nije potrebno čistiti za taj put.
            DisposeDxgiResources();
        }
    }
}
