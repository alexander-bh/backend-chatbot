function fillMissingHours(data) {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return hours.map(hour => {
        const found = data.find(d => d.hour === hour);
        return {
            hour,
            total: found ? found.total : 0
        };
    });
}

module.exports = fillMissingHours;