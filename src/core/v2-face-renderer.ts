/**
 * SiYuan v3.9 Flashcard V2 多类型卡面渲染与解析辅助（纯逻辑，仅在 review chunk 中使用）
 * 覆盖：quick / basic / cloze / ordered / image-occlusion / multi-line / typed-answer / choice / plugin。
 * 绝不把当前考核组之外的答案遮蔽、也不在正面泄题；严格脱离 .protyle-wysiwyg 运行。
 */

export interface V2FacePlan {
    sourceType: string;
    frontRefIDs: string[];
    backRefIDs: string[];
    activeGroupID?: string;
    activeOcclusionIDs: string[];
    activeStepID?: string;
    choiceOptionOrder?: string[];
    choiceMode?: "single" | "multiple";
    revealMode?: "all" | "steps";
    frontMode?: "hideAllAnswerOne" | "hideCurrent";
    isMultiBlock: boolean;
}

export function buildV2FacePlan(model: any, sessionCard?: any): V2FacePlan {
    const sourceType = String(model?.source?.sourceType ?? "quick").trim() || "quick";
    const refs: Array<{ entityID?: string; role?: string; sort?: number; fieldID?: string }> =
        Array.isArray(model?.references) ? model.references : [];
    const sortedRefs = [...refs].sort((a, b) => Number(a?.sort ?? 0) - Number(b?.sort ?? 0));
    const gen = (model?.source?.generationConfig && typeof model.source.generationConfig === "object")
        ? model.source.generationConfig
        : {};
    const variantData = (model?.card?.variantData && typeof model.card.variantData === "object")
        ? model.card.variantData
        : {};
    const variantKey = String(model?.card?.variantKey ?? "");

    const frontRefIDs: string[] = [];
    const backRefIDs: string[] = [];

    if (sourceType === "basic") {
        const reversed = variantKey === "reverse" || variantData.direction === "backward";
        for (const r of sortedRefs) {
            const id = String(r?.entityID ?? "").trim();
            if (!id) continue;
            const role = String(r?.role ?? "").toLowerCase();
            const isBack = role === "answer" || role === "back";
            if (reversed ? isBack : !isBack) frontRefIDs.push(id);
            else backRefIDs.push(id);
        }
        if (frontRefIDs.length === 0 && sortedRefs[0]?.entityID) {
            frontRefIDs.push(String(sortedRefs[0].entityID));
        }
    } else if (sourceType === "choice" || sourceType === "choiceSingle" || sourceType === "choiceMultiple") {
        for (const r of sortedRefs) {
            const id = String(r?.entityID ?? "").trim();
            if (!id) continue;
            const role = String(r?.role ?? "").toLowerCase();
            if (role === "option" || role === "distractor") backRefIDs.push(id);
            else frontRefIDs.push(id);
        }
    } else if (sourceType === "multi-line" || sourceType === "multiLineAll" || sourceType === "multiLineSteps") {
        for (const r of sortedRefs) {
            const id = String(r?.entityID ?? "").trim();
            if (!id) continue;
            const role = String(r?.role ?? "").toLowerCase();
            if (role === "answer" || role === "line" || role === "back") backRefIDs.push(id);
            else frontRefIDs.push(id);
        }
    } else {
        for (const r of sortedRefs) {
            const id = String(r?.entityID ?? "").trim();
            if (id) frontRefIDs.push(id);
        }
    }

    const activeGroupID = typeof variantData.groupID === "string" ? variantData.groupID : undefined;
    const activeStepID = typeof variantData.stepID === "string" ? variantData.stepID : undefined;
    const activeOcclusionIDs: string[] = [];

    if (Array.isArray(gen.occlusions) && activeGroupID) {
        for (const occ of gen.occlusions) {
            if (occ?.id && Array.isArray(occ.groupIDs) && occ.groupIDs.includes(activeGroupID)) {
                activeOcclusionIDs.push(String(occ.id));
            }
        }
    }
    if (Array.isArray(gen.steps) && activeStepID) {
        for (const step of gen.steps) {
            if (step?.id === activeStepID && Array.isArray(step.occlusionIDs)) {
                for (const oid of step.occlusionIDs) activeOcclusionIDs.push(String(oid));
            }
        }
    }
    if (typeof variantData.occlusionID === "string" && !activeOcclusionIDs.includes(variantData.occlusionID)) {
        activeOcclusionIDs.push(variantData.occlusionID);
    }

    const choiceOptionOrder = Array.isArray(sessionCard?.optionOrder)
        ? sessionCard.optionOrder.map(String)
        : undefined;

    return {
        sourceType,
        frontRefIDs,
        backRefIDs,
        activeGroupID,
        activeOcclusionIDs,
        activeStepID,
        choiceOptionOrder,
        choiceMode: gen.mode === "multiple" || sourceType === "choiceMultiple" ? "multiple" : (sourceType.startsWith("choice") ? "single" : undefined),
        revealMode: gen.revealMode === "steps" || sourceType === "multiLineSteps" ? "steps" : (sourceType.startsWith("multi") ? "all" : undefined),
        frontMode: gen.frontMode === "hideCurrent" ? "hideCurrent" : (sourceType.includes("occlusion") ? "hideAllAnswerOne" : undefined),
        isMultiBlock: sortedRefs.length > 1 || backRefIDs.length > 0,
    };
}

/**
 * 分组挖空卡 DOM 字符串脱敏：仅遮蔽 `activeOcclusionIDs` 命中的 `data-occlusion-id` 元素，
 * 保留其他分组的明文作为复习上下文。
 */
export function applyV2ClozeMaskToHtml(html: string, activeOcclusionIDs: string[], reveal = false): string {
    const raw = String(html ?? "");
    if (!raw || activeOcclusionIDs.length === 0) return raw;
    const activeSet = new Set(activeOcclusionIDs);
    return raw.replace(
        /(<[^>]*data-occlusion-id=["']([^"']+)["'][^>]*>)([\s\S]*?)(<\/[a-z0-9-]+>)/gi,
        (full, openTag, occId, inner, closeTag) => {
            if (!activeSet.has(occId)) {
                return full; // 其他分组明文透出作上下文
            }
            if (reveal) {
                return `${openTag}<span class="lv-v2-cloze-revealed">${inner}</span>${closeTag}`;
            }
            return `${openTag}<span class="lv-v2-cloze-blank" aria-label="挖空遮蔽">[…]</span>${closeTag}`;
        },
    );
}
