import { Router } from "express";
import { info } from "../controllers/prometheus/v2/info";
import { verifyBearerToken } from "../middleware/auth";

const router = Router();

router.get(
  "/info",
  verifyBearerToken,
  (req, res, next) => {
    res.set("Cache-Control", "public, max-age=30");
    next();
  },
  info,
);

export default router;
