function emitOrderEvent(io, event, order, diff = {}) {
    const payload = {
        event,
        orderId: String(order._id),
        organizationId: String(order.organization),
        data: diff,
        timestamp: Date.now(),
    };


    console.log(`📡 Emitting event ${event} for order ${String(order._id)} in org ${String(order.organization)}`);
    console.log("Payload:", payload);

    io.of("/orders/staff")
        .to(`org:${String(order.organization)}`)
        .emit(event, payload);

    io.of("/orders/admin")
        .to(`org:${String(order.organization)}`)
        .emit(event, payload);

    io.of("/orders/organizer")
        .to(`org:${String(order.organization)}`)
        .emit(event, payload);
}

module.exports = { emitOrderEvent };
