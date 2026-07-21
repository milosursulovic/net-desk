using System;

namespace NetdeskAgent.Common.Http
{
    public class NetdeskApiException : Exception
    {
        public int StatusCode { get; }

        public NetdeskApiException(int statusCode, string responseBody)
            : base(string.Format("HTTP {0}: {1}", statusCode, responseBody))
        {
            StatusCode = statusCode;
        }
    }
}
