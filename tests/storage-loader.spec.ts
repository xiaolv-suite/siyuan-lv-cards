import { describe, expect, it, vi } from "vitest";
import { readAllPluginStores, applyAllPluginStores } from "@/bootstrap/storage-loader";
import { ALL_STORE_KEYS, SETTINGS_DATA, REVLOG_DATA, INBOX_DATA } from "@/bootstrap/storage-keys";

describe("storage-loader 22槽存储批量加载与坏键容错机制", () => {
    it("readAllPluginStores 能够正常遍历全部 22 槽，且单槽异常时不阻塞其它槽位", async () => {
        const mockLoader = vi.fn(async (key: string) => {
            if (key === "corrupt-file.json") {
                throw new Error("磁盘损坏");
            }
            if (key === SETTINGS_DATA) {
                return { dailyReviewTarget: 25 };
            }
            if (key === REVLOG_DATA) {
                return { version: 1, entries: [] };
            }
            return null;
        });

        const customKeys = [...ALL_STORE_KEYS, "corrupt-file.json"];
        const result = await readAllPluginStores(mockLoader, customKeys);

        expect(result[SETTINGS_DATA]).toEqual({ dailyReviewTarget: 25 });
        expect(result[REVLOG_DATA]).toEqual({ version: 1, entries: [] });
        expect(result["corrupt-file.json"]).toBeUndefined();
        expect(Object.keys(result).length).toBe(customKeys.length);
    });

    it("applyAllPluginStores 正确将读取结果清洗并写入宿主，同时建立持久化快照", async () => {
        const dummyPlugin: any = {
            revlogMutationVersion: 0,
        };

        const loadedRaw = {
            [SETTINGS_DATA]: { dailyReviewTarget: 42 },
            [REVLOG_DATA]: { version: 1, entries: [], days: {} },
            [INBOX_DATA]: { version: 1, items: [] },
        };

        await applyAllPluginStores(dummyPlugin, loadedRaw);

        // 验证宿主字段是否被清洗并赋值
        expect(dummyPlugin.settings).toBeDefined();
        expect(dummyPlugin.settings.dailyReviewTarget).toBe(42);
        expect(dummyPlugin.revlog).toBeDefined();
        expect(dummyPlugin.inbox).toBeDefined();

        // 验证乐观回滚快照是否正确初始化
        expect(dummyPlugin.persistedSettingsSnapshot).toBeDefined();
        expect(dummyPlugin.persistedRevlogSnapshot).toBeDefined();
        expect(dummyPlugin.persistedInboxSnapshot).toBeDefined();
    });
});
