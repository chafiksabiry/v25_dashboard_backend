const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  chatInitiatedUrl: { type: String },
  departmentId: { type: String },
  departmentName: { type: String },
  endTime: { type: Date },
  crmInfo: { type: String },
  embedName: { type: String },
  visitorEmail: { type: String },
  notesAvailable: { type: Boolean },
  visitorName: { type: String },
  countryCode: { type: String },
  embedId: { type: String },
  chatInitiatedTime: { type: Date },
  visitorIp: { type: String },
  missedTime: { type: Date },
});

const Chat = mongoose.model("Chat", ChatSchema);
module.exports = Chat;
