import React from "react";
import { Pap5CoverPreview } from "./Pap5CoverPreview";
import type { AppData, GradebookApprovalStatus } from "../types";

interface Props {
  data: AppData["generalInfo"];
  appData: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
  readOnly?: boolean;
  onChange: (data: AppData["generalInfo"]) => void;
}

export const GeneralInfoForm: React.FC<Props> = ({
  data,
  appData,
  approvalStatus = null,
  readOnly = false,
  onChange,
}) => (
  <Pap5CoverPreview
    data={data}
    appData={appData}
    approvalStatus={approvalStatus}
    mode={readOnly ? "preview" : "edit"}
    onChange={onChange}
  />
);
