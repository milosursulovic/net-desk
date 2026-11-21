namespace NetdeskAgent.Common.Update
{
    /// <summary>Response of GET /api/agents/update.</summary>
    public class UpdateCheckResponse
    {
        public bool UpdateAvailable { get; set; }
        public string Version { get; set; }
        public string Sha256 { get; set; }
        public string Signature { get; set; }

        /// <summary>
        /// The PEM certificate the package was signed with (RSA-SHA256 over the raw
        /// bytes of the .zip file). Null if the server has no signing configured
        /// for this release - see UpdateManager.VerifySignatureIfPresent.
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
