import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import smsRouter from "./sms.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(smsRouter);

export default router;
