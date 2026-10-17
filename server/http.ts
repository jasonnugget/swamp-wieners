import compression from "compression";

// Compress repeated site evidence and large map/ML assets. SSE must flush each
// event immediately rather than waiting in a compression buffer.
export const responseCompression = compression({
  filter: (req, res) => req.path !== "/api/events" && compression.filter(req, res),
});
