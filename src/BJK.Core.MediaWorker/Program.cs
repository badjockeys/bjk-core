using BJK.Modules.Media;

// The media processing worker: takes jobs off the media.process queue, converts each upload with ffmpeg
// (720p H.264 video or WebP photos, plus a thumbnail, with metadata such as GPS stripped), publishes the results
// to the public bucket and marks the media Ready. It has no HTTP endpoints; run as many copies as you need.
//
// The API host owns the database schema, so start the API at least once before the worker.

const string ConnectionStringName = "AppDatabase";

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddMediaProcessing(builder.Configuration, ConnectionStringName);

var host = builder.Build();
await host.RunAsync();
