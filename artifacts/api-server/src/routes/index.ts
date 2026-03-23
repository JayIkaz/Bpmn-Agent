import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bpmnRouter from "./bpmn";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bpmnRouter);

export default router;
