const fakeCharge = async ({ orderId, amount }) => {
  await new Promise(r => setTimeout(r, 500));

  const outcomes = ["success", "fail", "timeout"];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

  if (outcome === "success") {
    return {
      success: true,
      transactionId: `PAY_${Date.now()}`,
    };
  }

  if (outcome === "fail") {
    return { success: false };
  }

  return { timeout: true };
};

module.exports = { fakeCharge };
