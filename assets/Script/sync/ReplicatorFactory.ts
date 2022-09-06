import { Vec3 } from "cc";
import { ArrayLinkReplicator, ArrayReplicator, isSimpleType, SimpleArrayReplicator } from "./ArrayReplicator";
import { CCVec3Replicator } from "./CocosReplicator";
import { ReplicateScanner } from "./DiffScaner";
import { ReplicateTrigger } from "./DiffTrigger";
import ReplicateMark, { ReplicateType } from "./ReplicateMark";
import { IReplicator } from "./SyncUtil";

export function createReplicator(target: any, mark?: ReplicateMark): IReplicator | null {
    // 根据target的类型和mark参数决定创建哪种类型的Replicator
    if (target instanceof Array) {
        if (mark) {
            let objMark = mark.getObjMark();
            if (objMark) {
                if (objMark.Type == ReplicateType.REPLICATE_SIMPLE_ARRAY) {
                    return new SimpleArrayReplicator(target, mark);
                } else if (objMark.Type == ReplicateType.REPLICATE_ARRAY) {
                    return new ArrayReplicator(target, mark);
                } else if (objMark.Type == ReplicateType.REPLICATE_LINK_ARRAY) {
                    return new ArrayLinkReplicator(target, mark);
                }
            }
        }
        if (target.length > 0) {
            if (isSimpleType(target[0])) {
                return new SimpleArrayReplicator(target, mark);
            } else {
                return new ArrayReplicator(target, mark);
            }
        }
        return null;
    } else if (target instanceof Vec3) {
        return new CCVec3Replicator(target);
    } else if (target instanceof Object) {
        if (mark) {
            let objMark = mark.getObjMark();
            if (objMark && objMark.Type == ReplicateType.REPLICATE_TRIGGER) {
                return new ReplicateTrigger(target, mark);
            }
        }
        return new ReplicateScanner(target, mark);
    } else {
        return null;
    }
}