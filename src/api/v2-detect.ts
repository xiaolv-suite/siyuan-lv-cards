import { fetchSyncPost } from "siyuan";
import { normalizeMigrationStatus, type FlashcardV2State, type MigrationStatus } from "./v2-contract";
import { requestWithPolicy } from "../libs/request";
import { unwrapKernelData } from "../libs/kernel-response";

export { normalizeMigrationStatus };
export type { FlashcardV2State, MigrationStatus };

export const V2_TIMEOUT_MS = 3000;

export async function detectFlashcardV2(): Promise<MigrationStatus | null> {
    try {
        const resp: any = await requestWithPolicy(
            () => (fetchSyncPost as any)("/api/flashcard/getMigrationStatus", {}),
            {
                timeoutMs: V2_TIMEOUT_MS,
                readOnly: true,
                retries: 1,
                dedupeKey: "v2:getMigrationStatus:{}",
                latestKey: "v2:getMigrationStatus",
            },
        );
        const data = unwrapKernelData<unknown>(resp);
        return normalizeMigrationStatus(data);
    } catch {
        return null;
    }
}
