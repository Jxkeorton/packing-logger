import type { APIRoute } from 'astro';
import { loadTodayState, readHistory, totalEarnings, totalPacks } from '../../lib/packing';
import { jsonOk } from '../../lib/api-response';

export const GET: APIRoute = async () => {
  const state = await loadTodayState();
  const history = await readHistory();

  return jsonOk({
    state,
    totalPacks: totalPacks(state.counts),
    totalEarnings: totalEarnings(state.counts),
    history,
  });
};
