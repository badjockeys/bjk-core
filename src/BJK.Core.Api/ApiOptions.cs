using System.ComponentModel.DataAnnotations;

namespace BJK.Core.Api;

/// <summary>Which identity server's tokens the API accepts. Section <c>Authentication</c>.</summary>
public sealed class ApiAuthenticationOptions
{
    public const string SectionName = "Authentication";

    /// <summary>The identity server, e.g. https://auth.badjockeys.com. Its discovery document supplies the signing keys.</summary>
    [Required]
    public Uri? Authority { get; set; }

    /// <summary>The API resource tokens must be issued for. The identity server's <c>bjk-api</c>.</summary>
    [Required]
    public string Audience { get; set; } = "bjk-api";

    /// <summary>
    /// Fetch the discovery document over HTTPS only. Always true in real environments; the CI smoke test turns it
    /// off to use a stand-in token issuer on http://localhost.
    /// </summary>
    public bool RequireHttpsMetadata { get; set; } = true;
}

/// <summary>Browser origins allowed to call the API, e.g. the web app. Section <c>Cors</c>.</summary>
public sealed class ApiCorsOptions
{
    public const string SectionName = "Cors";

    public const string PolicyName = "web";

    public string[] AllowedOrigins { get; set; } = [];
}
