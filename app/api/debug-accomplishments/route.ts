// Debug route — disabled in production
export async function GET() {
  return new Response('Debug endpoint disabled', { status: 404 });
}
