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
import { TANDEM_JUMP_TYPES } from '../tandem';

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

    // A tandem instructor jumps the dropzone's shared tandem system, never
    // their own gear — so it gets a fixed "Tandem Rig" label rather than
    // whatever's starred as the personal default, and no component names,
    // rather than looking one up (there's nothing to look up: nobody saves
    // a Rig called that, and even if they did, its components would start
    // silently accruing every tandem instructing jump as wear on gear that
    // was never actually on that jump — this is what applying the starred
    // default here used to do, and it's wrong for the instructing case
    // specifically. A camera flyer, unlike the instructor, does jump their
    // own rig — that path is untouched.
    const rig =
      jump.jumpTypeName === TANDEM_JUMP_TYPES.instructor
        ? { rig: 'Tandem Rig', canopy: '', lineset: '', pilotChute: '', container: '' }
        : resolveRigComponents(settings, settings.defaultRigId);

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
