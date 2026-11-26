// Read-only rules regressions: same signed role reader and pack as the player.
// Trust only the dev certificate for this process (see AGENTS.md).
import { createPlayerReader } from '../web/src/player/playerclient.js';
import { createPlayerStaticReader } from '../web/src/player/playerstatic.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';

const port = Number(process.env.DRAGON_TEST_PLAYER_PORT ?? 8444);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new RangeError('invalid loopback reader port');
export const localPlayerOrigin = `https://127.0.0.1:${port}`;
export async function localFormalChapter(gameId, chapter) {
  const reader = createPlayerReader({ origin: localPlayerOrigin });
  const entry = (await reader.registry()).directory.find(row => row.gameId === gameId);
  if (!entry) throw new Error('game is not listed in the local reader');
  const session = await reader.admit({ gameId, ordinal: entry.ordinal, chapterId: `${gameId}#${chapter}` });
  return loadPlayerPack({ session, compilerRevision: TRIAL_COMPILER_REVISION, mapExtent: true,
    readStatic: createPlayerStaticReader({ origin: localPlayerOrigin }), maxTotalBytes: 256 * 1024 * 1024 });
}
