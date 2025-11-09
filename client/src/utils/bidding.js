export function getBidIncrement(currentBid) {
    if (currentBid < 100000) {
        return 1000;
    } else if (currentBid < 500000) {
        return 5000;
    } else {
        return 10000;
    }
}