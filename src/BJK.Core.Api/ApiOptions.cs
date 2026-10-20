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

/// <summary>
/// The API reference: an OpenAPI document generated from the controllers by NSwag, and Swagger UI to try it.
/// Section <c>ApiDocs</c>. Nothing is stored; it always matches the running code.
/// </summary>
public sealed class ApiDocsOptions
{
    public const string SectionName = "ApiDocs";

    /// <summary>The OpenAPI document's address. <c>{documentName}</c> is <c>v1</c>.</summary>
    public const string DocumentPath = "/openapi/{documentName}.json";

    /// <summary>Swagger UI's address.</summary>
    public const string UiPath = "/api-docs";

    /// <summary>
    /// Serve the document and Swagger UI. Unset means on in Development only, so the API's shape isn't published
    /// in production unless someone chooses to.
    /// </summary>
    public bool? Enabled { get; set; }
}
