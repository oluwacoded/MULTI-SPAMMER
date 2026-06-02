import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import smsRouter from "./sms.js";
import dataRouter from "./data.js";
import gmailRouter from "./gmail.js";
import whatsappRouter from "./whatsapp.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(smsRouter);
router.use(dataRouter);
router.use(gmailRouter);
router.use(whatsappRouter);

export default router;
