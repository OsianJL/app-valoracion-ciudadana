import { deleteExpiredIpHashes, handleRequest, type Env } from "./handler.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await deleteExpiredIpHashes(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
