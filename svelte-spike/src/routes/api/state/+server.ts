import type { RequestHandler } from './$types';
import { totalEarnings, totalPacks } from '$lib/packing';
import { loadTodayState, readHistory } from '$lib/server/packing';
import { jsonOk } from '$lib/server/api-response';

export const GET: RequestHandler = async () => {
  const state = await loadTodayState();
  const history = await readHistory();
  return jsonOk({
    state,
    totalPacks: totalPacks(state.counts),
    totalEarnings: totalEarnings(state.counts),
    history,
  });
};
