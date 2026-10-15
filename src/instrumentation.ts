// Next.js 服务端启动钩子：装配适配器 + 种子 Provider + 启动队列 worker
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { seedProviders } = await import("./providers/index");
    const { startWorker } = await import("./lib/queue");
    await seedProviders();
    startWorker();
  }
}
