using BJK.Core.Api;
using BJK.Modules.Email;
using BJK.Modules.Media;
using BJK.Modules.Notifications;
using BJK.Modules.Posts;
using BJK.Modules.Profiles;
using BJK.Modules.Shared;
using BJK.Modules.Shared.Security;
using BJK.Modules.SMS;
using Microsoft.AspNetCore.HttpOverrides;

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

var app = builder.Build();

// Create the database if needed and apply each module's schema changes. Never drops data (see DatabaseMigrator).
await app.Services.InitialiseBjkModulesAsync();

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

app.MapControllers();
app.MapHealthChecks("/health");

await app.RunAsync();
