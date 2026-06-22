import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import smsRouter from "./sms.js";
import dataRouter from "./data.js";
import gmailRouter from "./gmail.js";
import whatsappRouter from "./whatsapp.js";
import gatewayRouter from "./gateway.js";
import smmRouter from "./smm.js";
import smmPanelRouter from "./smmPanel.js";
import toolsRouter from "./tools.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(smsRouter);
router.use(dataRouter);
router.use(gmailRouter);
router.use(whatsappRouter);
router.use(gatewayRouter);
router.use(smmRouter);
router.use(smmPanelRouter);
router.use(toolsRouter);

export default router;
