namespace NetdeskAgent.Common.Update
{
    /// <summary>Odgovor GET /api/agents/update.</summary>
    public class UpdateCheckResponse
    {
        public bool UpdateAvailable { get; set; }
        public string Version { get; set; }
        public string Sha256 { get; set; }
        public string Signature { get; set; }

        /// <summary>
        /// PEM sertifikat kojim je paket potpisan (RSA-SHA256 preko sirovih
        /// bajtova .zip fajla). Null ako server nema podešeno potpisivanje
        /// za ovaj release - videti UpdateManager.VerifySignatureIfPresent.
        /// </summary>
        public string SignatureCertificatePem { get; set; }

        public string ReleaseNotes { get; set; }
        public string DownloadUrl { get; set; }
    }

    /// <summary>Telo POST /api/agents/update/report zahteva.</summary>
    public class UpdateReportRequest
    {
        public string FromVersion { get; set; }
        public string ToVersion { get; set; }
        public bool Success { get; set; }
        public string Reason { get; set; }
    }
}
