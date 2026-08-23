import type { APIRoute } from 'astro';
import { loadTodayState, readHistory, totalEarnings, totalPacks } from '../../lib/packing';

export const GET: APIRoute = async () => {
  const state = await loadTodayState();
  const history = await readHistory();

  return new Response(
    JSON.stringify({
      state,
      totalPacks: totalPacks(state.counts),
      totalEarnings: totalEarnings(state.counts),
      history,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
