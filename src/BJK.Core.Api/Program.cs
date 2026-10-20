using BJK.Core.Api;
using BJK.Modules.Email;
using BJK.Modules.Media;
using BJK.Modules.Notifications;
using BJK.Modules.Posts;
using BJK.Modules.Profiles;
using BJK.Modules.Shared;
using BJK.Modules.Shared.Configuration;
using BJK.Modules.Shared.Security;
using BJK.Modules.SMS;
using Microsoft.AspNetCore.HttpOverrides;
using NSwag;
using NSwag.Generation.Processors.Security;

const string ConnectionStringName = "AppDatabase";

var builder = WebApplication.CreateBuilder(args);

// --- Who may call ---

// Access tokens come from bjk-identity-server. The modules' policies all use the ModuleAuthentication scheme.
builder.Services.AddOptions<ApiAuthenticationOptions>()
    .Bind(builder.Configuration.GetSection(ApiAuthenticationOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
var authentication = builder.Configuration.GetSection(ApiAuthenticationOptions.SectionName).Get<ApiAuthenticationOptions>()
    ?? new ApiAuthenticationOptions();

builder.Services.AddAuthentication(ModuleAuthentication.Scheme)
    .AddJwtBearer(ModuleAuthentication.Scheme, options =>
    {
        options.Authority = authentication.Authority?.ToString();
        options.Audience = authentication.Audience;
        options.RequireHttpsMetadata = authentication.RequireHttpsMetadata;

        // Keep the identity server's claim names ("sub", "role", "scope", "amr") as they are.
        options.MapInboundClaims = false;
        options.TokenValidationParameters.NameClaimType = "sub";
        options.TokenValidationParameters.RoleClaimType = "role";

        // Only access tokens: an ID token (typ "JWT") is refused even though the identity server signed it.
        options.TokenValidationParameters.ValidTypes = ["at+jwt"];
    });

var cors = builder.Configuration.GetSection(ApiCorsOptions.SectionName).Get<ApiCorsOptions>() ?? new ApiCorsOptions();
builder.Services.AddCors(options => options.AddPolicy(ApiCorsOptions.PolicyName, policy => policy
    .WithOrigins(cors.AllowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

// Azure Container Apps' ingress terminates TLS and forwards the original scheme and client address.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// --- Modules ---

builder.Services.AddBjkModules(
    builder.Configuration,
    new MediaModule(ConnectionStringName),
    new ProfilesModule(ConnectionStringName),
    new PostsModule(ConnectionStringName),
    new NotificationsModule(ConnectionStringName),
    new EmailModule(),
    new SMSModule());

builder.Services.AddHealthChecks();

// Outside Development the API refuses to start until every setting has a live value (the modules add their own;
// see "Deployed environments refuse to start" in the bjk-modules README).
builder.Services.RequireWhenDeployed("Authentication:Authority", "the identity server's https address", DeployedSettingChecks.IsHttps);
builder.Services.RequireWhenDeployed("Cors:AllowedOrigins:0", "the web app's https address", DeployedSettingChecks.IsHttps);

// --- API reference ---

// Generated from the controllers by NSwag at run time, so it always matches the code. See ApiDocsOptions.
const string BearerScheme = "Bearer";
var apiDocsEnabled = builder.Configuration.GetSection(ApiDocsOptions.SectionName).Get<ApiDocsOptions>()?.Enabled
    ?? builder.Environment.IsDevelopment();
builder.Services.AddOpenApiDocument(document =>
{
    document.DocumentName = "v1";
    document.Title = "Bad Jockeys API";
    document.Version = "v1";
    document.Description =
        "The Media, Profiles, Posts and Notifications modules. Calls that need a signed-in user take an access " +
        "token from bjk-identity-server with that module's scope (bjk.media, bjk.profiles or bjk.posts; " +
        "Notifications uses bjk.profiles). Back-office calls need the .manage scope too.";
    document.AddSecurity(BearerScheme, new OpenApiSecurityScheme
    {
        Type = OpenApiSecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "An access token from bjk-identity-server.",
    });
    // Marks only the endpoints that require authorisation, so anonymous ones show without a padlock.
    document.OperationProcessors.Add(new AspNetCoreOperationSecurityScopeProcessor(BearerScheme));
});

var app = builder.Build();

// --check-settings: run every startup settings check and exit, without touching the database. Deploy pipelines run
// it with the environment's settings before rolling out (docs/local-development.md, "Going live").
if (SettingsCheck.Requested(args))
{
    return SettingsCheck.Run(app.Services);
}

// Check the settings before touching the database: outside Development a missing setting stops here.
app.Services.GetService<Microsoft.Extensions.Options.IStartupValidator>()?.Validate();

// Create the database if needed and apply each module's schema changes. Never drops data (see DatabaseMigrator).
// Skipped while NSwag generates the web app's API client (nswag.json): it only reads the endpoints.
if (!builder.Configuration.GetValue<bool>("GeneratingApiClient"))
{
    await app.Services.InitialiseBjkModulesAsync();
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseCors(ApiCorsOptions.PolicyName);
app.UseAuthentication();
app.UseAuthorization();

if (apiDocsEnabled)
{
    app.UseOpenApi(settings => settings.Path = ApiDocsOptions.DocumentPath);
    app.UseSwaggerUi(settings =>
    {
        settings.Path = ApiDocsOptions.UiPath;
        settings.DocumentPath = ApiDocsOptions.DocumentPath;
    });
}

app.MapControllers();
app.MapHealthChecks("/health");

await app.RunAsync();
return 0;
