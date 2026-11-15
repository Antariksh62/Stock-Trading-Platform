const { model } = require("mongoose");
const { WebhookEventSchema } = require("../schemas/WebhookEventSchema");

const WebhookEventModel = model("webhook_event", WebhookEventSchema);

module.exports = { WebhookEventModel };

