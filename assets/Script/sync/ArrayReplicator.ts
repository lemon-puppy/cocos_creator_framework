import ReplicateMark from "./ReplicateMark";
import { createReplicator } from "./ReplicatorFactory";
import { Consturctor, getConsturctor, IReplicator, replicated } from "./SyncUtil";

export type SimpleType = number | string | boolean | bigint;

export function isSimpleType(obj: any): boolean {
    return typeof obj === "number" || typeof obj === "string" || typeof obj === "boolean" || typeof obj === "bigint";
}

/**
 * 数组对象某个版本的数据
 */
interface ArraySimpleVersionInfo {
    version: number;
    data: SimpleType;
}

/**
 * SimpleArrayReplicator 高效的数组对象同步器
 * 用于同步number、string、boolean、bigint等基础类型的数组对象
 */
export class SimpleArrayReplicator implements IReplicator {
    /** 最后一个有数据变化的版本号 */
    private lastVersion: number = 0;
    /** 最后一次检测的版本号 */
    private lastCheckVersion: number = 0;
    /** 数组长度发生变化的最后一个版本 */
    private lastLengthVersion: number = 0;
    private data: ArraySimpleVersionInfo[];
    private target: SimpleType[];

    constructor(target: SimpleType[], mark?: ReplicateMark) {
        this.target = target;
        this.data = [];
        this.makeUpDataArray(target, mark);
    }

    makeUpDataArray(target: SimpleType[], mark?: ReplicateMark) {
        for (let i = 0; i < target.length; i++) {
            this.data.push({ version: 0, data: target[i] });
        }
    }

    getTarget() {
        return this.target;
    }

    setTarget(target: any): void {
        this.target = target;
    }

    genDiff(fromVersion: number, toVersion: number): any {
        if (toVersion < fromVersion) {
            return false;
        }
        let needScan = this.lastCheckVersion < toVersion;
        // 如果不需要扫描，且最终版本小于fromVersion，则直接返回
        if (!needScan && fromVersion > this.lastVersion) {
            return false;
        }
        // 如果需要扫描，先判断长度是否相等
        if (needScan) {
            let diff: SimpleType[] = [this.target.length];
            let lengthChanged = this.data.length != this.target.length;
            if (lengthChanged) {
                this.lastLengthVersion = toVersion;
            }
            if (this.data.length > this.target.length) {
                // 删除多余的data
                this.data.splice(this.target.length, this.data.length - this.target.length);
            }
            for (let i = 0; i < this.target.length; i++) {
                if (this.data.length <= i) {
                    this.data.push({ version: toVersion, data: this.target[i] });
                    diff.push(i, this.target[i]);
                } else if (this.data[i].data != this.target[i]) {
                    this.data[i].version = toVersion;
                    this.data[i].data = this.target[i];
                    diff.push(i, this.target[i]);
                } else if (this.data[i].version >= fromVersion && this.data[i].version <= toVersion) {
                    diff.push(i, this.target[i]);
                }
            }
            this.lastCheckVersion = toVersion;
            // 没有任何变化
            if (!lengthChanged && diff.length == 1) {
                return false;
            }
            this.lastVersion = toVersion;
            return diff;
        } else {
            // 遍历data，过滤出版本范围内的数据
            let diff: SimpleType[] = [this.target.length];
            for (let i = 0; i < this.data.length; i++) {
                if (this.data[i].version >= fromVersion && this.data[i].version <= toVersion) {
                    diff.push(i, this.data[i].data);
                }
            }
            // 没有任何变化
            if (this.lastLengthVersion < fromVersion && diff.length == 1) {
                return false;
            }
            return diff;
        }
    }

    applyDiff(diff: any): void {
        if (diff instanceof Array) {
            // 如果长度减少，删除多余的对象
            let length = diff[0];
            if (length < this.target.length) {
                this.target.splice(length, this.target.length - length);
            }
            // 遍历修改或push
            for (let i = 1; i < diff.length; i += 2) {
                let index = diff[i];
                let value = diff[i + 1];
                if (index >= this.target.length) {
                    this.target.push(value);
                } else {
                    this.target[index] = value;
                }
            }
        }
    }
    getVersion(): number {
        return this.lastVersion;
    }
}

/**
 * 测试SimpleArrayReplicator的diff生成与应用
 */
export function TestSimpleArrayReplicator() {
    let source: number[] = [1, 2, 3, 4, 5];
    let sourceRp = new SimpleArrayReplicator(source);
    let target: number[] = [1, 2, 3, 4, 5];
    let targetRp = new SimpleArrayReplicator(target);

    source.push(6);
    source.push(7);
    source.splice(1, 0, 8);
    source.splice(3, 1);
    // swap source[3] and source[4]
    let temp = source[3];
    source[3] = source[4];
    source[4] = temp;

    let diff = sourceRp.genDiff(0, 1);
    console.log(diff);
    targetRp.applyDiff(diff);
    console.log(source);
    console.log(target);
}

export function TestSimpleArrayReplicatorVersion() {
    let source: number[] = [];
    let sourceRp = new SimpleArrayReplicator(source);
    let target1: number[] = [];
    let targetRp1 = new SimpleArrayReplicator(target1);
    let target2: number[] = [];
    let targetRp2 = new SimpleArrayReplicator(target2);

    source.push(1, 3, 5);
    let diff1 = sourceRp.genDiff(0, 1);
    console.log(diff1);
    targetRp1.applyDiff(diff1);
    console.log(source);
    console.log(target1);

    source.push(2, 4, 6);
    source.splice(0, 0, 1);
    let diff2 = sourceRp.genDiff(1, 2);
    console.log(diff2);
    targetRp1.applyDiff(diff2);
    console.log(source);
    console.log(target1);

    source.splice(0, 1);
    source.push(7, 8, 9);
    let diff3 = sourceRp.genDiff(0, 3);
    console.log(diff3);
    targetRp2.applyDiff(diff3);
    console.log(source);
    console.log(target2);

    let diff4 = sourceRp.genDiff(2, 3);
    console.log(diff4);
    targetRp1.applyDiff(diff4);
    console.log(target1);
}

interface ArrayObjectVersionInfo {
    version: number;
    index: number;
    data: IReplicator;
}

/**
 * ArrayReplicator 数组对象同步器
 * 用于同步对象类型的数组，例如自定义的ReplicateClass、cc.Vec2、cc.Color、cc.Rect等
 */
export class ArrayReplicator<T> implements IReplicator {
    private data: ArrayObjectVersionInfo[];
    private target: Array<T>;
    private lastVersion: number = 0;
    private lastCheckVersion: number = 0;
    private ctor: Consturctor<T>;

    constructor(target: Array<T>, mark?: ReplicateMark) {
        let objMark = mark?.getObjMark();
        if (objMark?.Constructor) {
            this.ctor = objMark?.Constructor;
        } else {
            // 如果没有指定Constructor，则target数组不得为空
            this.ctor = getConsturctor(target[0]);
        }
        this.target = target;
        this.data = [];
        this.makeUpDataArray(target, mark);
    }

    getTarget() {
        return this.target;
    }

    setTarget(target: any): void {
        this.target = target;
    }

    pushData(data: T, version: number, mark?: ReplicateMark) {
        let replicator = createReplicator(data, mark);
        if (replicator) {
            this.data.push({
                version,
                index: this.data.length,
                data: replicator
            });
        } else {
            console.error("ArrayReplicator.pushData createReplicator error:", data);
        }
    }

    makeUpDataArray(target: Array<T>, mark?: ReplicateMark) {
        for (let i = 0; i < target.length; ++i) {
            this.pushData(target[i], this.lastVersion, mark);
        }
    }

    genDiff(fromVersion: number, toVersion: number): any {
        if (toVersion < fromVersion) {
            return false;
        }

        // 长度都为0时，不发生变化
        if (this.target.length == 0 && this.data.length == 0) {
            return false;
        }

        let needScan = this.lastCheckVersion < toVersion;
        // 如果不需要扫描，且最终版本小于fromVersion，则直接返回
        if (!needScan && fromVersion > this.lastVersion) {
            return false;
        }

        let ret: Array<any> = [];
        if (needScan) {
            ret.push(this.target.length);
            for (let i = 0; i < this.target.length; i++) {
                // 如果数组长度小于当前索引，则直接添加
                if (this.data.length <= i) {
                    this.pushData(this.target[i], toVersion);
                    ret.push(i, this.data[i].data.genDiff(-1, toVersion));
                } else {
                    let data: IReplicator = this.data[i].data;
                    // 如果由于数组的插入与删除，导致对象下标变化，则需要重新绑定
                    if (data.getTarget() != this.target[i]) {
                        data.setTarget(this.target[i]);
                    }
                    let diff = data.genDiff(fromVersion, toVersion);
                    // 如果不是新插入的，则需要有diff才进入ret
                    if (diff) {
                        ret.push(i, diff);
                    }
                }
            }
            this.lastCheckVersion = toVersion;
        } else {
            // 先记录长度，再比较数据，这里不再扫描target，直接使用data
            ret.push(this.data.length);
            for (let i = 0; i < this.data.length; i++) {
                let data: IReplicator = this.data[i].data;
                // 如果version大于fromVersion，则表示为新插入的，必须添加到ret
                if (this.data[i].version > fromVersion) {
                    ret.push(i, data.genDiff(-1, toVersion));
                } else {
                    // 元素有变化则更新
                    let diff = data.genDiff(fromVersion, toVersion);
                    if (diff) {
                        ret.push(i, diff);
                    }
                }
            }
        }

        // 如果没有差异（ret的长度为1），且长度相同，则返回false
        if (ret.length == 1 && ret[0] == this.data.length) {
            return false;
        }

        this.lastVersion = toVersion;
        // 如果data的长度大于target的长度，则删除data的多余部分
        if (this.data.length > this.target.length) {
            this.data.splice(this.target.length, this.data.length - this.target.length);
        }
        return ret;
    }

    applyDiff(diff: any): void {
        if (diff instanceof Array) {
            // 如果长度减少，删除多余的对象
            let length = diff[0];
            if (length < this.target.length) {
                this.target.splice(length, this.target.length - length);
            }
            // 遍历修改或push
            for (let i = 1; i < diff.length; i += 2) {
                let index = diff[i];
                let value = diff[i + 1];
                // 如果需要创建新的对象
                if (index >= this.target.length) {
                    // TODO: 如果有构造函数参数，如何传递？
                    // 暂时只能使用默认构造函数，数值的变化可以使用applyDiff更新
                    this.target.push(new this.ctor());
                    let replicator = createReplicator(this.target[index]);
                    if (replicator) {
                        this.data.push({
                            version: this.lastVersion,
                            data: replicator,
                            index: index
                        });
                    }
                }
                this.data[index].data.applyDiff(value);
            }
        }
    }

    getVersion(): number {
        return this.lastVersion;
    }
}

export function TestArrayReplicator() {
    class Point {
        @replicated()
        x: number = 0;
        @replicated()
        y: number = 0;
        constructor(x: any = 0, y: any = 0) {
            this.x = x;
            this.y = y;
        }
    }

    let source: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let replicator = new ArrayReplicator(source);
    let target: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let targetReplicator = new ArrayReplicator(target);
    source.push(new Point(5, 6));
    source.push(new Point(7, 8));
    source[0].x = 10;
    source[1].y = 20;
    console.log(source);
    let diff = replicator.genDiff(0, 1);
    console.log(diff);
    targetReplicator.applyDiff(diff);
    console.log(target);

    source.splice(1, 2);
    diff = replicator.genDiff(1, 2);
    console.log(diff);
    targetReplicator.applyDiff(diff);
    console.log(source);
    console.log(target);

    let target2: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let targetReplicator2 = new ArrayReplicator(target2);
    diff = replicator.genDiff(0, 2);
    console.log(diff);
    targetReplicator2.applyDiff(diff);
    console.log(source);
    console.log(target2);
}

enum ActionType {
    Insert, // 插入, index: 插入的位置
    Delete, // 删除, index: 删除的位置
    Move,   // 移动，count: 总数, index: 移动的位置，to: 移动到的位置，因为move会有相互影响，所以Move需要一次性处理完毕，避免上一次Move的结果影响到了下一次Move
    Clear,  // 清空
    Update, // 更新，index: 更新的位置
}

interface ArrayActionInfo {
    version: number,
    actions: number[],
}

interface SwapInfo {
    targetIndex: number,
    sourceIndex: number,
    sourceData?: ArrayObjectVersionInfo
}

function fillSwapInfo(map: Map<any, SwapInfo>, source: any, target: any, sourceData: ArrayObjectVersionInfo | undefined, index: number) {
    if (source) {
        let sourceSwapInfo = map.get(source);
        if (!sourceSwapInfo) {
            sourceSwapInfo = {
                targetIndex: -1,
                sourceIndex: index,
                sourceData: sourceData
            };
            map.set(source, sourceSwapInfo);
        } else {
            sourceSwapInfo.sourceIndex = index;
        }
    }
    if (target) {
        let targetSwapInfo = map.get(target);
        if (!targetSwapInfo) {
            targetSwapInfo = {
                targetIndex: index,
                sourceIndex: -1,
            };
            map.set(target, targetSwapInfo);
        } else {
            targetSwapInfo.targetIndex = index;
        }
    }
}

export class ArrayLinkReplicator<T> implements IReplicator {
    private data: Array<ArrayObjectVersionInfo>;
    private dataIndexMap: Map<T, number>;
    private target: Array<T>;
    private actionSequence: Array<ArrayActionInfo> = [];
    private lastVersion: number = 0;
    private lastCheckVersion: number = 0;
    private ctor: Consturctor<T>;

    constructor(target: Array<T>, mark?: ReplicateMark) {
        let objMark = mark?.getObjMark();
        if (objMark?.Constructor) {
            this.ctor = objMark?.Constructor;
        } else {
            // 如果没有指定Constructor，则target数组不得为空
            this.ctor = getConsturctor(target[0]);
        }
        this.target = target;
        this.data = [];
        this.dataIndexMap = new Map();
        this.makeUpDataArray(target, mark);
    }

    getTarget() {
        return this.target;
    }

    setTarget(target: any): void {
        this.target = target;
    }

    pushData(data: T, version: number, mark?: ReplicateMark) {
        let replicator = createReplicator(data, mark);
        if (replicator) {
            this.data.push({
                version: version,
                data: replicator,
                index: this.data.length
            });
        } else {
            console.error("ArrayReplicator.pushData createReplicator error:", data);
        }
    }

    insertData(data: T, index: number, version: number, mark?: ReplicateMark) {
        let replicator = createReplicator(data, mark);
        if (replicator) {
            this.data.splice(index, 0, {
                version: version,
                data: replicator,
                index: index
            });
        } else {
            console.error("ArrayReplicator.insertData createReplicator error:", data);
        }
    }

    makeUpDataArray(target: Array<T>, mark?: ReplicateMark) {
        for (let i = 0; i < target.length; ++i) {
            this.pushData(target[i], this.lastVersion, mark);
            this.dataIndexMap.set(target[i], i);
        }
    }

    /**
     * 清理具体某个版本的操作序列，actions是操作序列，包含了插入、删除、移动3种情况，格式如下：
     * 插入和删除操作的格式为：[action, index]，其中action是操作类型，index是操作的位置
     * 移动操作序列的格式为：[action, index, to]，其中action是操作类型，index是操作的位置，to是移动的目标位置
     * 当delIndex在当前的操作序列中匹配到插入操作时，则删除这个操作，返回-1表示结束
     * 当delIndex在当前的操作序列中匹配到移动操作的to位置时，for循环结束后，应该修改为该移动操作的index位置
     * @param delIndex 
     * @param actions 
     * @returns 新下标
     */
    clearActionSequence(delIndex: number, actions: number[]): number {
        let insertIndex = -1;
        let beforeMoveIndex = -1;
        for (let i = 0; i < actions.length; ++i) {
            let action = actions[i];
            let index1 = actions[i + 1];

            // 如果是插入操作，且插入的位置是要删除的位置，则删除这个插入操作
            if (ActionType.Insert == action && index1 == delIndex) {
                insertIndex = i;
            }

            ++i;
            if (index1 > delIndex) {
                actions[i] = index1 - 1;
            }

            if (ActionType.Move == action) {
                ++i;
                let index2 = actions[i];
                if (index2 > delIndex) {
                    actions[i] = index2 - 1;
                } else if (index2 == delIndex) {
                    beforeMoveIndex = index1;
                }
            }
        }

        if (insertIndex >= 0) {
            actions.splice(insertIndex, 2);
            return -1;
        }

        if (beforeMoveIndex >= 0) {
            return beforeMoveIndex;
        }

        return delIndex;
    }


    /**
     * 优化合并已删除的元素的操作历史，避免过多的操作历史
     * @param delActions 删除的操作
     */
    mergeActionSequence(delActions: Array<any>) {
        // 因为需要支持任意一个版本更新到最新版本，所以需要保留所有的操作历史
        // // 遍历所有删除的下标（需要跳过ActionType.Delete
        // for (let j = 1; j < delActions.length; j+=2) {
        //     let delIndex = delActions[j];
        //     // 逆序遍历actionSequence
        //     for (let i = this.actionSequence.length - 1; i >= 0; --i) {
        //         let action = this.actionSequence[i];
        //         // 如果是删除操作
        //         if (action[0] == ActionType.Delete) {
        //             if (action[1] > delIndex) {
        //                 // 如果删除的下标小于当前删除的下标，则当前删除的下标减一
        //                 action[1] -= 1;
        //             }
        //             ++i; // 跳过1个参数
        //         }
        //         // 如果是插入操作
        //         else if (action[0] == ActionType.Insert) {
        //         }
        //         // 如果是移动操作
        //         else if (action[0] == ActionType.Move) {
        //         }
        //     }
        // }
    }

    /**
     * 使用二分法查找有序的actionSequence中，actionSequence.version>=version的最小index
     * @param version 
     * @returns 
     */
    getActionIndex(version: number): number {
        let left = 0;
        let right = this.actionSequence.length - 1;
        while (left <= right) {
            let mid = Math.floor((left + right) / 2);
            if (this.actionSequence[mid].version == version) {
                return mid;
            } else if (this.actionSequence[mid].version < version) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return left;
    }

    /**
     * 生成删除操作，并删除data数组和dataIndexMap中的数据
     * @param delCnt 
     * @returns 
     */
    genDeleteAction(delCnt: number): Array<any> {
        let delRet = [];
        if (this.data.length > 10) {
            let targetIndexMap = new Map<T, number>();
            for (let i = 0; i < this.target.length; ++i) {
                targetIndexMap.set(this.target[i], i);
            }
            // 逆序遍历data，如果dataIndexMap中不存在，则删除
            for (let i = this.data.length - 1; i >= 0; --i) {
                let target = this.data[i].data.getTarget();
                if (!targetIndexMap.has(target)) {
                    delRet.push(ActionType.Delete, i);
                    this.dataIndexMap.delete(target);
                    this.data.splice(i, 1);

                    if (--delCnt == 0) {
                        break;
                    }
                }
            }
        } else if (this.data.length > 0) {
            for (let i = this.data.length - 1; i >= 0; --i) {
                let target = this.data[i].data.getTarget();
                if (this.target.indexOf(target) < 0) {
                    delRet.push(ActionType.Delete, i);
                    this.dataIndexMap.delete(target);
                    this.data.splice(i, 1);

                    if (--delCnt == 0) {
                        break;
                    }
                }
            }
        }

        // TODO: 当生成了新的删除操作时，可以优化actionSequence中的操作历史
        return delRet;
    }

    /**
     * 生成交换操作，并更新data数组和dataIndexMap中的数据
     * @returns 
     */
    genSwapAction(actions: Array<any>): Array<any> {
        // 最后检测移动操作，移动操作都是成对出现的——交换(连续交换)
        let swapMap = new Map<any, SwapInfo>();
        for (let i = 0; i < this.data.length; ++i) {
            let target = this.data[i].data.getTarget();
            // 例如下标1和2交换，2和3又交换，如果直接执行两两交换，先前交换的下标会影响后续的交换
            // target:  [1, 2, 3]
            // data:    [2, 3, 1]
            // 输出结果为 [Move, 0, 1, Move, 1, 2, Move, 2, 0]
            if (this.target[i] != target) {
                // 当知道当前下标需要交换时，记录下2份信息：
                // 1. targe[i] 处于下标i的位置，需要交换到其他位置（暂时不清楚是哪个位置，但遍历完可以知道）
                // 2. data[i] 处于下标i的位置，会被交换成target中的某个元素（暂时不清楚是哪个元素，但遍历完可以知道）
                fillSwapInfo(swapMap, target, this.target[i], this.data[i], i);
            }
        }

        // 遍历swapMap，应用交换
        if (swapMap.size > 0) {
            actions.push([ActionType.Move, swapMap.size]);
            for (let [key, value] of swapMap) {
                if (value.sourceData) {
                    this.data[value.targetIndex] = value.sourceData;
                }
                this.dataIndexMap.set(key, value.targetIndex);
                actions.push(value.sourceIndex, value.targetIndex);
            }
        }
        return actions;
    }

    /**
     * 生成上个版本到此次版本的操作序列，这里包含了插入、删除、移动和清空操作
     * @returns [类型1, 操作1, 操作2, 类型2, 操作2...]
     */
    genActionSequence2(): Array<any> {
        // 先检测插入和删除操作，如果执行完插入和删除，下标不一致的，才需要进行移动操作
        let ret: any[] = [];

        // 删没了，直接清空操作序列，收到diff的length可以直接清空
        if (this.target.length == 0) {
            this.dataIndexMap.clear();
            this.data.length = 0;
            return [ActionType.Clear];
        }

        // 遍历target
        let swapMap = new Map<any, SwapInfo>();
        for (let i = 0; i < this.target.length; ++i) {
            let target = this.target[i];
            if (this.data.length <= i) {
                fillSwapInfo(swapMap, target, null, undefined, i);
            } else {
                let source = this.data[i].data.getTarget();
                fillSwapInfo(swapMap, target, source, this.data[i], i);
            }
        }

        // 如果还有更多的data没有被遍历到，说明需要删除
        if (this.data.length > this.target.length) {
            for (let i = this.target.length; i < this.data.length; ++i) {
                fillSwapInfo(swapMap, null, this.data[i].data.getTarget(), this.data[i], i);
            }
        }

        // 如果没有位置的变化，swapMap为空
        if (swapMap.size == 0) {
            return ret;
        }

        // 根据swapMap生成对应的操作
        let insertActions: number[] = [];
        let deleteActions: number[] = [];

        for (let [_target, swapInfo] of swapMap.entries()) {
            if (swapInfo.targetIndex === -1) {
                insertActions.push(swapInfo.sourceIndex);
            } else if (swapInfo.sourceIndex === -1) {
                deleteActions.push(swapInfo.targetIndex);
            }
        }

        // 按照下标顺序对操作数组进行排序
        insertActions.sort((a, b) => a - b);
        deleteActions.sort((a, b) => b - a);

        // 先执行所有的删除操作
        for (let index of deleteActions) {
            let target = this.data[index].data.getTarget();
            this.data.splice(index, 1);
            this.dataIndexMap.delete(target);
        }

        // 再执行所有的插入操作
        for (let index of insertActions) {
            let target = this.target[index];
            this.insertData(target, index, this.lastVersion);
        }

        // 重新构建一个新的swapMap，用于存储已更新的sourceIndex和targetIndex
        let newSwapMap = new Map<any, SwapInfo>();
        for (let i = 0; i < this.target.length; ++i) {
            let target = this.target[i];
            let source = this.data[i].data.getTarget();
            if (target != source) {
                fillSwapInfo(newSwapMap, target, source, this.data[i], i);
            }
        }

        // 遍历第二个swapMap，直接将移动操作添加到结果数组中
        for (let [target, swapInfo] of newSwapMap.entries()) {
            ret.push(ActionType.Move, swapInfo.sourceIndex, swapInfo.targetIndex);
            [this.data[swapInfo.sourceIndex], this.data[swapInfo.targetIndex]] = [this.data[swapInfo.targetIndex], this.data[swapInfo.sourceIndex]];
            this.dataIndexMap.set(target, swapInfo.targetIndex);
        }

        if (deleteActions.length > 0) {
            ret.push(ActionType.Delete, deleteActions.length, ...deleteActions);
        }
        if (insertActions.length > 0) {
            ret.push(ActionType.Insert, insertActions.length, ...insertActions);
        }
        return ret;
    }

    /**
     * 快速对比data和target的差异，生成操作序列并将target的元素位置更新到data和dataIndexMap中
     * 如果没有新的变化，那么data[i].data.getTarget() 与 target[i]是同一个对象
     * dataIndexMap中存储的是data[i].data.getTarget() 与 i 的映射关系
     * 调用该方法之前，target数组可能添加了新的元素，也可能删除了元素，也可能移动了元素
     * 需要插入新元素时，执行this.insertData(this.target[i], i, this.lastVersion);在data中的i位置插入
     * 同时，如果data中存在target中不存在的元素，则删除data中的元素和dataIndexMap中的元素
     * 操作序列数组的格式为[ActionType, ...params]
     * 1. 如被清空，则返回[ActionType.Clear]
     * 2. 如有插入，则返回[ActionType.Insert, count, index1, index2...]
     * 3. 如有删除，则返回[ActionType.Delete, count, index1, index2...]
     * 4. 如有移动，则返回[ActionType.Move, count, index1, to1, index2, to2...]
     * 非清空的情况下，返回顺序为删除、插入、移动
     * @returns 操作序列数组，格式为[ActionType, ...params]
     */
    genActionSequence3(): any[] {
        // 先检测插入和删除操作，如果执行完插入和删除，下标不一致的，才需要进行移动操作
        let ret: any[] = [];

        // 删没了，直接清空操作序列，收到diff的length可以直接清空
        if (this.target.length == 0) {
            this.dataIndexMap.clear();
            this.data.length = 0;
            return [ActionType.Clear];
        }

        let oldIndex: number[] = [];
        let newDataIndexMap = new Map<T, number>();
        let insertIndices: number[] = [];
        let deleteIndices: number[] = [];
        // 遍历target
        for (let i = 0; i < this.target.length; ++i) {
            let target = this.target[i];
            // 如果dataIndexMap中不存在，则表示是新插入的
            let old = this.dataIndexMap.get(target);
            if (old == undefined) {
                oldIndex.push(-1);
                insertIndices.push(i);
            } else {
                // 记录原来的坐标
                oldIndex.push(old);
                this.dataIndexMap.delete(target);
            }
            newDataIndexMap.set(target, i);
        }

        // 剩下的dataIndexMap中所有元素都是需要删除的
        this.dataIndexMap.forEach((value, key) => {
            deleteIndices.push(value);
        });

        // 先执行删除操作，删除的都是target中不存在的元素，所以并不影响insert
        if (deleteIndices.length > 0) {
            ret.push(ActionType.Delete, deleteIndices.length, ...deleteIndices.sort((a, b) => b - a));
            for (let i of deleteIndices) {
                let delCnt = this.data.splice(i, 1);
                // 删除数量校验
                if (delCnt.length != 1) {
                    console.error(`Gen Action: =========== delCnt.length != 1, delCnt.length=${delCnt.length}`);
                }
            }
        }

        // 执行插入操作，这里的目标位置都是正确的，而且按从小到大的顺序排列，所以不需要额外排序
        // 之所以先执行删除操作，是因为删除操作会导致后面的下标发生变化
        // 而删除target中不存在的元素，并不影响这里的操作将target插入到正确的data中
        if (insertIndices.length > 0) {
            ret.push(ActionType.Insert, insertIndices.length, ...insertIndices);
            for (let i of insertIndices) {
                this.insertData(this.target[i], i, this.lastVersion);
            }
        }

        // data和target长度校验
        if (this.data.length != this.target.length) {
            console.error(`Gen Action: =========== this.data.length != this.target.length, this.data.length=${this.data.length}, this.target.length=${this.target.length}`);
        }

        // 开源开始前的data和target
        console.log(`Gen Action: =========== this.target=${JSON.stringify(this.target)}`);
        this.debugData();

        // 最后的交换操作，需要边遍历边执行，因为交换操作会导致后面的下标发生变化
        let moveIndices: number[] = [];
        for (let i = 0; i < this.data.length; ++i) {
            // 这里之所以用while循环，是为了解决连续交换的问题
            // 交换之后，当前data[i]的target可以去到正确的位置，但交换过来的data[i]的target可能还是不正确的
            // 所以这里是要保证data[i]的target与target[i]是同一个对象
            while (true) {
                let target = this.data[i].data.getTarget();
                let index = newDataIndexMap.get(target);
                // 找出当前下标的正确位置，如果不是当前位置，则需要交换，因为在这里做了swap，所以不会出现重复的交换
                if (index !== undefined && index != i) {
                    moveIndices.push(i, index);
                    [this.data[i], this.data[index]] = [this.data[index], this.data[i]];
                } else {
                    break;
                }
            }
        }

        if (moveIndices.length > 0) {
            ret.push(ActionType.Move, moveIndices.length / 2, ...moveIndices);
        }

        // 刷新一下dataIndexMap
        this.dataIndexMap = newDataIndexMap;
        return ret;
    }

    /**
     * 生成上个版本到此次版本的操作序列，这里包含了插入、删除、移动和清空操作
     * @returns [类型1, 操作1, 操作2, 类型2, 操作2...]
     */
    genActionSequence(): Array<any> {
        // 先检测插入和删除操作，如果执行完插入和删除，下标不一致的，才需要进行移动操作
        let ret = [];

        // 删没了，直接清空操作序列，收到diff的length可以直接清空
        if (this.target.length == 0) {
            this.dataIndexMap.clear();
            this.data.length = 0;
            return [ActionType.Clear];
        }

        // 如果最新的target数组对比上次的target数组，有出现增删交换等情况，则需要重新生成操作序列
        let hasChange = false;
        let minIndex = -1;
        // 遍历target，检查dataIndexMap中是否有对应target的下标，必须0开始遍历
        for (let i = 0; i < this.target.length; ++i) {
            // 如果不存在则标记为新插入的
            if (!this.dataIndexMap.has(this.target[i])) {
                ret.push(ActionType.Insert, i);
                this.dataIndexMap.set(this.target[i], i);
                if (hasChange == false) {
                    hasChange = true;
                    // 计算最小影响的下标
                    minIndex = i;
                }
            } else if (!hasChange && this.dataIndexMap.get(this.target[i]) != i) {
                hasChange = true;
            }
        }
        // 计算考虑了插入操作后，删除的数量（这里dataIndexMap已经包含了插入后的数据）
        let delCnt = this.dataIndexMap.size - this.target.length;

        // 没有变化就直接返回
        if (!hasChange && delCnt == 0) {
            return ret;
        }

        // 如果有删除操作，先应用删除操作
        let delRet = this.genDeleteAction(delCnt);

        // 如果有插入操作，应用插入操作，这里是从前往后插入
        for (let i = 0; i < ret.length; i += 2) {
            if (ret[i] == ActionType.Insert) {
                this.insertData(this.target[ret[i + 1]], ret[i + 1], this.lastVersion);
            }
        }

        // 需要先删除，再插入（TODO: 这里是否有更优化的写法？）
        if (delRet.length > 0) {
            // delRet最后一个表示最小的删除的下标
            let minDelIndex = delRet[delRet.length - 1];
            if (minDelIndex < minIndex) {
                minIndex = minDelIndex;
            }
            // 把delRet数组插入到ret的前面
            ret = delRet.concat(ret);
        }

        // 断言，this.data的长度和this.target的长度一致
        if (this.data.length != this.target.length) {
            console.error("this.data.length != this.target.length");
        }

        // 最后检测移动操作，移动操作都是成对出现的——交换(连续交换)
        ret = this.genSwapAction(ret);

        // 刷新一下dataIndexMap
        if (minIndex >= 0) {
            for (let i = minIndex; i < this.target.length; ++i) {
                this.dataIndexMap.set(this.target[i], i);
            }
        }

        return ret;
    }

    genDiff(fromVersion: number, toVersion: number) {
        if (toVersion < fromVersion) {
            return false;
        }

        let needScan = this.lastCheckVersion < toVersion;
        // 如果不需要扫描，且最终版本小于fromVersion，则直接返回
        if (!needScan && fromVersion > this.lastVersion) {
            return false;
        }

        if (needScan) {
            let actions = this.genActionSequence3();
            this.lastCheckVersion = toVersion;
            if (actions.length > 0) {
                // 如果是清空操作
                if (actions[0] == ActionType.Clear) {
                    this.actionSequence = [{
                        version: toVersion,
                        actions: actions
                    }];
                    this.lastVersion = toVersion;
                    return actions;
                } else {
                    this.actionSequence.push({
                        version: toVersion,
                        actions: actions
                    });
                }
            }
        }

        // 获取从fromVersion到最新的操作序列，从fromVersion的下一个操作开始
        let fromIndex = 0;
        if (fromVersion > 0) {
            fromIndex = this.getActionIndex(fromVersion + 1);
        }
        let toIndex = this.actionSequence.length;
        let ret = [];
        for (let i = fromIndex; i < toIndex; ++i) {
            ret.push(...this.actionSequence[i].actions);
        }

        // 遍历生成[下标，Diff, 下标，Diff...]的序列
        let diffRet = [];
        for (let i = 0; i < this.data.length; ++i) {
            // 如果是在这之后新插入的，则需要从0开始完整同步
            if (this.data[i].version > fromVersion) {
                fromVersion = 0;
            }
            let diff = this.data[i].data.genDiff(fromVersion, toVersion);
            if (diff) {
                diffRet.push(i, diff);
            }
        }

        // 如果有diff，则将diff插入到ret的最后
        if (diffRet.length > 0) {
            ret.push(ActionType.Update, ...diffRet);
        }

        if (ret.length > 0) {
            this.lastVersion = toVersion;
        }
        return ret;
    }

    applyDiff(diff: any): void {
        if (!(diff instanceof Array)) {
            return;
        }

        for (let i = 0; i < diff.length; ++i) {
            let action = diff[i];
            if (action == ActionType.Insert) {
                // 插入操作的格式为：[ActionType.Insert, count, 下标, 下标...]
                let count = diff[++i];
                let logStr = `insert ${count} items at `;
                for (let j = 0; j < count; ++j) {
                    let index = diff[++i];
                    logStr += `${index}, `;
                    let target = new this.ctor();
                    this.target.splice(index, 0, target);
                    this.insertData(target, index, this.lastVersion);
                }
                console.log(logStr + ` i = ${i}`);
            } else if (action == ActionType.Delete) {
                // 删除操作的格式为：[ActionType.Delete, count, 下标，下标...]
                let count = diff[++i];
                let logStr = `delete ${count} items at `;
                for (let j = 0; j < count; ++j) {
                    let index = diff[++i];
                    logStr += `${index}, `;
                    this.data.splice(index, 1);
                    this.target.splice(index, 1);
                }
                console.log(logStr + ` i = ${i}`);
            } else if (action == ActionType.Move) {
                let count = diff[++i];
                let logStr = `move ${count} items from `;
                // 批量取出再更新，避免连续交换导致的数据错误
                for (let j = 0; j < count; ++j) {
                    let index1 = diff[++i];
                    let index2 = diff[++i];
                    [this.data[index1], this.data[index2]] = [this.data[index2], this.data[index1]];
                    [this.target[index1], this.target[index2]] = [this.target[index2], this.target[index1]];
                    logStr += `${index1} to ${index2}, `;
                }
                console.log(logStr + ` i = ${i}`);
            } else if (action == ActionType.Update) {
                // 更新操作的格式为：[ActionType.Update, 下标，Diff, 下标，Diff...]
                // 更新操作是最后一个操作，批量处理完，把data中对应的数据更新Diff
                for (let j = i + 1; j < diff.length; j += 2) {
                    let index = diff[j];
                    let data = diff[j + 1];
                    this.data[index].data.applyDiff(data);
                }
                break;
            } else if (action == ActionType.Clear) {
                this.target.length = 0;
                this.data.length = 0;
            }
        }
    }

    getVersion(): number {
        return this.lastVersion;
    }

    /**
     * 检查this.data与this.target的一致性
     * 以及this.dataIndexMap的一致性
     * 如果不一致，则打印不一致的信息
     */
    debugCheck() {
        if (this.data.length != this.target.length) {
            console.error("this.data.length != this.target.length");
        }

        for (let i = 0; i < this.data.length; ++i) {
            if (this.data[i].data.getTarget() != this.target[i]) {
                console.error(`this.data[${i}].target != this.target[${i}]`);
            }
            if (this.dataIndexMap.get(this.target[i]) != i) {
                console.error("this.dataIndexMap.get(this.target[i]) != i");
            }
        }
    }

    checkData() {
        // 检查data中是否有undefined
        for (let i = 0; i < this.data.length; ++i) {
            if (this.data[i] == undefined) {
                console.error(`this.data[${i}] == undefined`);
            }
        }
    }

    debugData() {
        // 把data中的target按顺序添加到数组中，并打印json
        let data = [];
        for (let i = 0; i < this.data.length; ++i) {
            data.push(this.data[i].data.getTarget());
        }
        console.log(JSON.stringify(data));
    }
}

function isEqual(obj1: any, obj2: any): boolean {
    // 如果两个对象引用相同，则它们是相等的
    if (obj1 === obj2) {
        return true;
    }

    // 如果两个对象的类型不同，则它们不相等
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // 如果两个对象都是 null 或 undefined，则它们是相等的
    if (obj1 == null && obj2 == null) {
        return true;
    }

    // 如果一个对象是 null 或 undefined，而另一个不是，则它们不相等
    if (obj1 == null || obj2 == null) {
        return false;
    }

    // 如果两个对象都是基本类型，则比较它们的值
    if (typeof obj1 !== 'object' && typeof obj2 !== 'object') {
        return obj1 === obj2;
    }

    // 如果两个对象都是数组，则比较它们的元素
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            return false;
        }

        for (let i = 0; i < obj1.length; i++) {
            if (!isEqual(obj1[i], obj2[i])) {
                return false;
            }
        }

        return true;
    }

    // 如果两个对象都是对象，则比较它们的属性
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (const key of keys1) {
        if (keys2.indexOf(key) === -1 || !isEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}

export function TestArrayLinkReplicator2() {
    class Point {
        @replicated()
        x: number = 0;
        @replicated()
        y: number = 0;
        constructor(x: any = 0, y: any = 0) {
            this.x = x;
            this.y = y;
        }
    }

    let source: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let replicator = new ArrayLinkReplicator(source);
    let target: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let targetReplicator = new ArrayLinkReplicator(target);
    source.push(new Point(5, 6));
    source.push(new Point(7, 8));
    source[0].x = 10;
    source[1].y = 20;
    source.length = 0;
    let diff = replicator.genDiff(0, 1);
    let diff2 = replicator.genDiff(0, 1);
    // 按json格式输出
    console.log(JSON.stringify(diff));
    console.log(JSON.stringify(source));
    targetReplicator.applyDiff(diff);
    console.log(JSON.stringify(target));

    // 断言，source和target应该是相等的，使用isEqual比较
    if (!isEqual(source, target)) {
        console.error("source != target");
    }

    source.splice(1, 2);
    diff = replicator.genDiff(1, 2);
    console.log(JSON.stringify(diff));
    console.log(JSON.stringify(source));
    targetReplicator.applyDiff(diff);
    console.log(JSON.stringify(target));
    // 断言，source和target应该是相等的，使用isEqual比较
    if (!isEqual(source, target)) {
        console.error("source != target");
    }

    // 把source的前面2个元素交换位置
    [source[0], source[1]] = [source[1], source[0]];
    let target2: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let targetReplicator2 = new ArrayLinkReplicator(target2);
    diff = replicator.genDiff(0, 3);
    console.log(JSON.stringify(diff));
    console.log(JSON.stringify(source));
    targetReplicator2.applyDiff(diff);
    console.log(JSON.stringify(target2));
    // 断言，source和target应该是相等的，使用isEqual比较
    if (!isEqual(source, target2)) {
        console.error("source != target2");
    }
}

export function TestArrayLinkReplicator() {
    class Point {
        @replicated()
        x: number = 0;
        @replicated()
        y: number = 0;
        constructor(x: any = 0, y: any = 0) {
            this.x = x;
            this.y = y;
        }
    }

    const seed = 123456;
    let currentSeed = seed;

    function customRandom() {
        const a = 1664525;
        const c = 1013904223;
        const m = 2 ** 32;
        currentSeed = (a * currentSeed + c) % m;
        return currentSeed / m;
    }

    const operationWeights = [2, 2, 0, 3]; // Adjust the weights of operations: [insert, delete, update, swap]

    function getRandomOperationType(operationWeights: number[]) {
        const totalWeight = operationWeights.reduce((a, b) => a + b, 0);
        let randomWeight = customRandom() * totalWeight;
        let operationType = -1;

        for (let i = 0; i < operationWeights.length; i++) {
            randomWeight -= operationWeights[i];
            if (randomWeight < 0) {
                operationType = i;
                break;
            }
        }

        return operationType;
    }

    function performRandomOperations(source: Array<Point>, n: number) {
        let beforStr = JSON.stringify(source);
        for (let i = 0; i < n; i++) {
            let operationType = getRandomOperationType(operationWeights);
            let index = Math.floor(customRandom() * source.length);

            switch (operationType) {
                case 0: // insert
                    source.splice(index, 0, new Point(Math.floor(customRandom() * 1000), Math.floor(customRandom() * 1000)));
                    console.log(`performRandomOperations: insert 1 item at ${index}, length is ${source.length}`);
                    break;
                case 1: // delete
                    if (source.length > 0) {
                        source.splice(index, 1);
                        console.log(`performRandomOperations: delete 1 item at ${index}, length is ${source.length}`);
                    }
                    break;
                case 2: // update
                    if (source.length > 0) {
                        source[index].x = Math.floor(customRandom() * 1000);
                        source[index].y = Math.floor(customRandom() * 1000);
                        console.log(`performRandomOperations: update item at ${index}, new value: (${source[index].x.toFixed(2)}, ${source[index].y.toFixed(2)})`);
                    }
                    break;
                case 3: // swap
                    if (source.length > 1) {
                        let index2 = (index + 1) % source.length;
                        [source[index], source[index2]] = [source[index2], source[index]];
                        console.log(`performRandomOperations: swap items at ${index} and ${index2}`);
                    }
                    break;
            }
        }
        // 打印前后对比
        console.log("performRandomOperations befor : " + beforStr);
        console.log("performRandomOperations after : " + JSON.stringify(source));
        console.log("perform end ================================================");

    }

    function performTest(
        source: Array<Point>,
        target: Array<Point>,
        replicator: ArrayLinkReplicator<Point>,
        targetReplicator: ArrayLinkReplicator<Point>,
        startVersion: number,
        endVersion: number
    ) {
        let diff = replicator.genDiff(startVersion, endVersion);
        console.log(JSON.stringify(diff));
        console.log(JSON.stringify(source));
        targetReplicator.applyDiff(diff);

        if (!isEqual(source, target)) {
            console.log(JSON.stringify(target));
            console.error("source != target");
        }
    }

    let source: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let target1: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let target2: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    let replicator = new ArrayLinkReplicator(source);
    let targetReplicator1 = new ArrayLinkReplicator(target1);
    let targetReplicator2 = new ArrayLinkReplicator(target2);

    let totalVersions = 500;
    let version1 = 0;
    let version2 = 0;

    for (let i = 0; i < totalVersions; i++) {
        console.log(`performTest: version i = ${i} ==========`);
        performRandomOperations(source, Math.floor(customRandom() * 10) + 1);

        let updateFrequency1 = Math.floor(customRandom() * 5) + 1;
        let updateFrequency2 = Math.floor(customRandom() * 5) + 1;

        if (i % updateFrequency1 === 0) {
            console.log(`performTest: version1 = ${version1}, endVersion1 = ${i+1}************************`);
            performTest(source, target1, replicator, targetReplicator1, version1, i+1);
            version1 = i+1;
        }

        if (i % updateFrequency2 === 0) {
            console.log(`performTest: version2 = ${version2}, endVersion2 = ${i+1}************************`);
            performTest(source, target2, replicator, targetReplicator2, version2, i+1);
            version2 = i+1;
        }
    }
}