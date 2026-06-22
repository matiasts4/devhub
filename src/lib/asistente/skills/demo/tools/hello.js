export async function execute({ name = 'world' }) {
  return { greeting: `Hello, ${name}!` };
}
