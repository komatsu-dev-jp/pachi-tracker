export function createMoveTableActionGuard() {
    let claimed = false;

    return {
        claim() {
            if (claimed) return false;
            claimed = true;
            return true;
        },
        release() {
            claimed = false;
        },
    };
}
