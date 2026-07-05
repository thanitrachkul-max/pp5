import React from "react";
import { Pap5CoverPreview } from "./Pap5CoverPreview";
import type { AppData, GradebookApprovalStatus } from "../types";

interface Props {
  data: AppData["generalInfo"];
  appData: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
  onChange: (data: AppData["generalInfo"]) => void;
}

export const GeneralInfoForm: React.FC<Props> = ({
  data,
  appData,
  approvalStatus = null,
  onChange,
}) => (
  <Pap5CoverPreview
    data={data}
    appData={appData}
    approvalStatus={approvalStatus}
    mode="edit"
    onChange={onChange}
  />
);
