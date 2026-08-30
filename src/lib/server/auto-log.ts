// Adding a logbook entry on behalf of another part of the app, filling
// every field from its saved default exactly as starting a jump by hand
// would.
//
// Extracted from actions/tandem.ts's autoLogTandemJump when the Burble
// manifest sync needed the same behaviour: two copies of "resolve the
// starred place/aircraft/rig, then addEntry" is exactly how one of them
// drifts from the other.
import { addEntry as addLogbookEntry } from './logbook';
import { ensureJumpType, readLogbookSettings, resolveRigComponents } from './logbook-settings';

export interface AutoLogJump {
  /** Logbook jump type to file this under — added to the saved list if new. */
  jumpTypeName: string;
  date: string; // YYYY-MM-DD
  /** Shared id, so the caller's own record and this entry delete together. */
  at: string;
  description: string;
  /**
   * Registration to log this jump against, when the caller knows it — the
   * manifest does, from the load name. Used only if it matches a saved
   * aircraft; anything else falls back to the starred default, so a plate
   * that isn't in the list can't silently write an unknown value.
   */
  aircraftPlate?: string;
}

/**
 * Best-effort by design: the caller's own ledger (a tandem jump, a synced
 * manifest slot) is the record that matters, so a logbook-side failure is
 * logged rather than surfaced as an error that would fail the whole action.
 */
export async function autoLogJump(jump: AutoLogJump): Promise<void> {
  try {
    await ensureJumpType(jump.jumpTypeName);
    const settings = await readLogbookSettings();

    const place = settings.places.find((p) => p.id === settings.defaultPlaceId);
    const rig = resolveRigComponents(settings, settings.defaultRigId);

    // Note this applies the default rig to instructor jumps too. So if the
    // starred rig is your own sport rig, its components accrue jumps from
    // tandem instructing as well — star the rig you actually jump on
    // tandems, or clear the default, if you're tracking component wear
    // closely. (Carried over from actions/tandem.ts, where this was first
    // written; unchanged so behaviour there stays identical.)
    const matchedByPlate = jump.aircraftPlate
      ? settings.aircraft.find((a) => a.plate.trim().toLowerCase() === jump.aircraftPlate!.trim().toLowerCase())
      : undefined;
    const aircraft = matchedByPlate ?? settings.aircraft.find((a) => a.id === settings.defaultAircraftId);

    await addLogbookEntry(
      {
        date: jump.date,
        place: place?.name ?? '',
        exitAltitude: '', // no default exists for this one
        rig: rig.rig,
        canopy: rig.canopy,
        lineset: rig.lineset,
        pilotChute: rig.pilotChute,
        container: rig.container,
        aad: '',
        aircraft: aircraft?.plate ?? '',
        jumpType: jump.jumpTypeName,
        description: jump.description,
      },
      settings.baseJumps,
      jump.at,
    );
  } catch (err) {
    console.error('Failed to auto-log a jump to the logbook', err);
  }
}
