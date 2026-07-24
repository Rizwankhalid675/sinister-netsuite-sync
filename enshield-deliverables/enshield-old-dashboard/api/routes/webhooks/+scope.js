export default async function webhookScope(server) {
  if (!server.hasRequestDecorator("rawBody")) {
    server.decorateRequest("rawBody", null);
  }
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      request.rawBody = body;
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (error) {
        error.statusCode = 400;
        done(error);
      }
    }
  );
}
