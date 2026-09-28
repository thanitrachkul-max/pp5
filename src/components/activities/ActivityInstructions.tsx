import React, { useState } from "react";
import { ClipboardCheck, FileText, Scale, UserRoundPen } from "lucide-react";

interface InstructionPageProps {
  /** ส่วนหัวเหนือหน้ากระดาษ (ปุ่มเลือกหน้าคำชี้แจง) ไม่แสดงตอนพิมพ์ */
  header?: React.ReactNode;
}

function InstructionPage({ children, header }: { children: React.ReactNode } & InstructionPageProps) {
  return (
    <div className="flex flex-col items-center gap-5 overflow-auto rounded-2xl bg-slate-100/90 p-4 sm:p-6">
      {header}
      <div
        className="rounded-lg bg-white p-10 shadow-[0_12px_32px_-8px_rgb(15,23,42,0.12)] ring-1 ring-slate-200/80"
        style={{ width: "1123px", minHeight: "794px", fontFamily: "Sarabun" }}
      >
        <div className="text-[16px] leading-[1.9] text-black">{children}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`mb-1 text-lg font-bold ${className}`}>{children}</h2>;
}

/** ย่อหน้าแบบเยื้องบรรทัดถัดไปให้ตรงกับข้อความหลังเลขข้อ */
function Numbered({
  number,
  children,
  indent = 0,
}: {
  number: string;
  children: React.ReactNode;
  indent?: number;
}) {
  return (
    <div className="flex" style={{ paddingLeft: `${indent}rem` }}>
      <span className="shrink-0 pr-2" style={{ minWidth: number.length > 3 ? "2.6rem" : "2rem" }}>
        {number}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Meaning({ term, children, indent = 0 }: { term: string; children: React.ReactNode; indent?: number }) {
  return (
    <div className="grid grid-cols-[4.2rem_4.4rem_1fr]" style={{ paddingLeft: `${indent}rem` }}>
      <span className="font-bold">{term}</span>
      <span>หมายถึง</span>
      <span>{children}</span>
    </div>
  );
}

function BlankBox() {
  return <span className="mx-1 inline-block h-4 w-4 translate-y-0.5 border border-slate-600 align-baseline" />;
}

export function ActivityInstructions1({ header }: InstructionPageProps = {}) {
  return (
    <InstructionPage header={header}>
      <h1 className="instruction-document-title">การประเมินกิจกรรมพัฒนาผู้เรียน</h1>

      <SectionTitle>หลักการประเมิน</SectionTitle>
      <p className="indent-12">
        การประเมินกิจกรรมพัฒนาผู้เรียนตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551
        เป็นกระบวนการประเมินจากการปฏิบัติกิจกรรมและผลงาน/ชิ้นงานของผู้เรียนด้วยวิธีการที่หลากหลาย
        และประเมินตามสภาพจริง โดย
      </p>
      <Numbered number="1." indent={2.5}>
        ให้ผู้เรียนได้ค้นหาศักยภาพของตนเอง การทำงานกลุ่ม ทักษะการอยู่ร่วมกันและการมีจิตสาธารณะ
      </Numbered>
      <Numbered number="2." indent={2.5}>
        ทุกฝ่ายมีส่วนร่วมในการประเมิน เช่น ครู ผู้ปกครอง เพื่อนนักเรียน
      </Numbered>
      <Numbered number="3." indent={2.5}>
        สถานศึกษามีการประเมินผลเป็นระยะ ๆ เพื่อรวบรวมข้อมูลและพัฒนาอย่างต่อเนื่อง
      </Numbered>

      <SectionTitle className="mt-3">แนวทางการประเมิน</SectionTitle>
      <Numbered number="1.">การประเมินกิจกรรมพัฒนาผู้เรียนรายกิจกรรม มีแนวปฏิบัติ ดังนี้</Numbered>
      <Numbered number="1.1">ตรวจสอบเวลาเข้าร่วมกิจกรรมของผู้เรียนให้เป็นไปตามเกณฑ์ที่สถานศึกษากำหนด</Numbered>
      <Numbered number="1.2">
        ประเมินกิจกรรมพัฒนาผู้เรียนจากการปฏิบัติกิจกรรมและผลงาน/ชิ้นงานของผู้เรียนตามเกณฑ์ที่สถานศึกษากำหนด
        ด้วยวิธีการที่หลากหลาย และใช้การประเมินตามสภาพจริง
      </Numbered>
      <Numbered number="1.3">
        ผู้เรียนที่มีเวลาการเข้าร่วมกิจกรรมการปฏิบัติกิจกรรมและผลงาน/ชิ้นงานของผู้เรียนตามเกณฑ์ที่สถานศึกษากำหนด
        เป็นผู้ผ่านการประเมินรายกิจกรรมและนำผลการประเมินไปบันทึกในระเบียนแสดงผลการเรียน
      </Numbered>
      <Numbered number="1.4">
        ผู้เรียนที่มีผลการประเมินไม่ผ่านตามเกณฑ์เวลาการเข้าร่วมกิจกรรม หรือเกณฑ์การปฏิบัติกิจกรรมและผลงาน/ชิ้นงานของผู้เรียนหรือทั้งสองเกณฑ์ ถือว่าไม่ผ่านการประเมินผลกิจกรรมพัฒนาผู้เรียน ผู้สอนต้องดำเนินการซ่อมเสริมและประเมินจนผ่าน ทั้งนี้ควรดำเนินการให้เสร็จสิ้นในปีการศึกษานั้น
        ยกเว้นมีเหตุสุดวิสัยให้อยู่ในดุลยพินิจของสถานศึกษา
      </Numbered>

      <div className="mt-3">
        <Numbered number="2.">การประเมินกิจกรรมพัฒนาผู้เรียนเพื่อการตัดสิน</Numbered>
      </div>
      <p className="pl-8">
        การประเมินกิจกรรมพัฒนาผู้เรียน เป็นการประเมินการผ่านกิจกรรมพัฒนาผู้เรียนเป็นรายภาค/รายปี
        เพื่อสรุปผลการผ่านในแต่ละกิจกรรม สรุปผลรวมเพื่อเลื่อนชั้นและประมวลผลรวมในปีสุดท้ายเพื่อการจบแต่ละระดับการศึกษาโดยการดำเนินการดังกล่าวมีแนวปฏิบัติ ดังนี้
      </p>
      <Numbered number="2.1" indent={2}>
        กำหนดให้มีผู้รับผิดชอบในการรวบรวมข้อมูลเกี่ยวกับการร่วมกิจกรรมพัฒนาผู้เรียนของผู้เรียนทุกคนตลอดระดับการศึกษา
      </Numbered>
      <Numbered number="2.2" indent={2}>
        ผู้รับผิดชอบสรุปและตัดสินผลการร่วมกิจกรรมพัฒนาผู้เรียนของผู้เรียนเป็นรายบุคคลตามเกณฑ์ที่สถานศึกษากำหนด เกณฑ์การจบแต่ละระดับการศึกษาที่สถานศึกษากำหนดนั้น ผู้เรียนจะต้องผ่านกิจกรรม 3 กิจกรรมสำคัญ ดังนี้
      </Numbered>
      <div className="pl-[4.5rem]">
        <Numbered number="1)">กิจกรรมแนะแนว</Numbered>
        <Numbered number="2)">กิจกรรมนักเรียน ได้แก่ (๑) กิจกรรมลูกเสือ-เนตรนารี (๒) กิจกรรมชุมนุม</Numbered>
        <Numbered number="3)">กิจกรรมเพื่อสังคมและสาธารณประโยชน์</Numbered>
      </div>
      <Numbered number="2.3" indent={2}>
        นำเสนอผลการประเมินต่อคณะอนุกรรมการกลุ่มสาระการเรียนรู้และกิจกรรมพัฒนาผู้เรียนเพื่อให้ความเห็นชอบ
      </Numbered>
      <Numbered number="2.4" indent={2}>
        เสนอผู้บริหารสถานศึกษา พิจารณาอนุมัติผลการประเมินกิจกรรมพัฒนาผู้เรียนผ่านเกณฑ์การจบแต่ละระดับการศึกษา
      </Numbered>
    </InstructionPage>
  );
}

export function ActivityInstructions2({ header }: InstructionPageProps = {}) {
  return (
    <InstructionPage header={header}>
      <SectionTitle>เกณฑ์การตัดสิน</SectionTitle>
      <p>
        ผู้เรียนจะต้องได้รับการประเมินกิจกรรมพัฒนาผู้เรียนและผ่านเกณฑ์ตามที่สถานศึกษากำหนด
        โดยกำหนดเกณฑ์ในการประเมินอย่างเหมาะสม ดังนี้
      </p>
      <Numbered number="1.">
        กำหนดคุณภาพหรือเกณฑ์ในการประเมินตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน กำหนดไว้ 2 ระดับ คือ ผ่าน (ผ)
        และไม่ผ่าน (มผ)
      </Numbered>
      <Numbered number="2.">
        กำหนดประเด็นการประเมินให้สอดคล้องตามวัตถุประสงค์ในแต่ละกิจกรรมและกำหนดเกณฑ์การผ่านการประเมิน ดังนี้
      </Numbered>

      <div className="mt-2">
        <Numbered number="2.1">เกณฑ์การตัดสินผลการประเมินรายกิจกรรม</Numbered>
      </div>
      <div className="space-y-1 pl-8">
        <Meaning term="ผ่าน">
          ผู้เรียนมีเวลาเข้าร่วมกิจกรรมครบตามเกณฑ์ปฏิบัติกิจกรรม และมีผลงาน/ชิ้นงาน/คุณลักษณะตามเกณฑ์ที่สถานศึกษากำหนด
        </Meaning>
        <Meaning term="ไม่ผ่าน">
          ผู้เรียนมีเวลาเข้าร่วมไม่ครบตามเกณฑ์ ไม่ผ่านการปฏิบัติกิจกรรม หรือมีผลงานชิ้นงาน/คุณลักษณะไม่เป็นไปตามเกณฑ์ที่สถานศึกษากำหนด
        </Meaning>
      </div>

      <div className="mt-2">
        <Numbered number="2.2">เกณฑ์การตัดสินผลการประเมินกิจกรรมพัฒนาผู้เรียนรายปี/รายภาค</Numbered>
      </div>
      <div className="space-y-1 pl-8">
        <Meaning term="ผ่าน">
          ผู้เรียนมีผลการประเมินระดับ “ผ” ในกิจกรรมสำคัญทั้ง ๓ กิจกรรม คือ กิจกรรมแนะแนว
          กิจกรรมนักเรียน กิจกรรมเพื่อสังคมและสาธารณประโยชน์
        </Meaning>
        <Meaning term="ไม่ผ่าน">
          ผู้เรียนมีผลการประเมินระดับ “มผ” ในกิจกรรมสำคัญกิจกรรมใดกิจกรรมหนึ่งจาก ๓ กิจกรรม
          คือ กิจกรรมแนะแนว กิจกรรมนักเรียน กิจกรรมเพื่อสังคมและสาธารณประโยชน์
        </Meaning>
      </div>

      <div className="mt-2">
        <Numbered number="2.3">เกณฑ์การตัดสินผลการประเมินกิจกรรมพัฒนาผู้เรียนเพื่อจบระดับการศึกษา</Numbered>
      </div>
      <div className="space-y-1 pl-8">
        <Meaning term="ผ่าน">ผู้เรียนมีผลการประเมินระดับ “ผ” ทุกชั้นปีในระดับการศึกษานั้น</Meaning>
        <Meaning term="ไม่ผ่าน">ผู้เรียนมีผลการประเมินระดับ “มผ” บางชั้นปีในระดับการศึกษานั้น</Meaning>
      </div>

      <SectionTitle className="mt-6">แนวทางการแก้ไขนักเรียนกรณีไม่ผ่านเกณฑ์</SectionTitle>
      <p className="indent-12">
        กรณีที่ผู้เรียนไม่ผ่านกิจกรรม ให้เป็นหน้าที่ของครูหรือผู้รับผิดชอบกิจกรรมนั้น ๆ ที่จะต้องซ่อมเสริม
        โดยให้ผู้เรียนดำเนินกิจกรรมจนครบตามเวลาที่ขาดหรือปฏิบัติกิจกรรมให้บรรลุตามวัตถุประสงค์ของกิจกรรมนั้น
        แล้วจึงประเมินให้ผ่านกิจกรรมเพื่อบันทึกในระเบียนแสดงผลการเรียน ยกเว้นมีเหตุสุดวิสัยให้รายงานผู้บริหารสถานศึกษาทราบ เพื่อดำเนินการช่วยเหลือผู้เรียนอย่างเหมาะสมเป็นรายกรณีไป
      </p>
    </InstructionPage>
  );
}

const FLOW_STROKE = "#0369a1";
const FLOW_FILL = "#e0f2fe";
const FLOW_STRONG = "#0ea5e9";
const FLOW_SOFT = "#7dd3fc";
const FLOW_TEXT = "#0c4a6e";

function FlowBox({
  x,
  y,
  width,
  height,
  lines,
  fontSize = 18,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  fontSize?: number;
}) {
  const lineHeight = fontSize * 1.35;
  const firstLine = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={FLOW_FILL} stroke={FLOW_STROKE} strokeWidth={2.2} />
      <rect x={x + 4} y={y + 4} width={width - 8} height={height - 8} rx={2} fill="none" stroke={FLOW_STROKE} strokeWidth={0.9} />
      {lines.map((line, index) => (
        <text
          key={line}
          x={x + width / 2}
          y={firstLine + index * lineHeight}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={700}
          fill={FLOW_TEXT}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/** แผนภาพขั้นตอนการประเมินกิจกรรมพัฒนาผู้เรียน */
export function ActivityAssessmentFlowchart() {
  return (
    <svg
      viewBox="0 0 760 580"
      role="img"
      aria-labelledby="activity-flow-title activity-flow-desc"
      className="mx-auto block h-auto w-full max-w-[720px]"
      style={{ fontFamily: "Sarabun, sans-serif" }}
    >
      <title id="activity-flow-title">แผนภาพการประเมินกิจกรรมพัฒนาผู้เรียน</title>
      <desc id="activity-flow-desc">
        กิจกรรมแนะแนว กิจกรรมนักเรียน และกิจกรรมเพื่อสังคมและสาธารณประโยชน์ ผ่านการประเมินตามเกณฑ์
        ถ้าตามเกณฑ์จะผ่านและนำไปสู่ผลการจัดกิจกรรม ถ้าไม่ตามเกณฑ์จะไม่ผ่านและต้องซ่อมเสริมก่อนประเมินใหม่
      </desc>
      <defs>
        <marker id="activity-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={FLOW_STROKE} />
        </marker>
        <linearGradient id="activity-flow-strong" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor={FLOW_STRONG} />
        </linearGradient>
      </defs>

      <ellipse cx={380} cy={42} rx={176} ry={34} fill="url(#activity-flow-strong)" stroke={FLOW_STROKE} strokeWidth={1.5} />
      <text x={380} y={42} textAnchor="middle" dominantBaseline="central" fontSize={24} fontWeight={800} fill="#ffffff">
        กิจกรรมพัฒนาผู้เรียน
      </text>

      <g stroke={FLOW_STROKE} strokeWidth={1.8} fill="none">
        <path d="M380 76 V96 M130 96 H630" />
        <path d="M130 96 V120" markerEnd="url(#activity-flow-arrow)" />
        <path d="M380 96 V120" markerEnd="url(#activity-flow-arrow)" />
        <path d="M630 96 V120" markerEnd="url(#activity-flow-arrow)" />
        <path d="M130 186 V206 H630 V186 M380 186 V206" />
        <path d="M380 206 V236" markerEnd="url(#activity-flow-arrow)" />
      </g>

      <FlowBox x={30} y={122} width={200} height={64} lines={["กิจกรรมแนะแนว"]} />
      <FlowBox x={280} y={122} width={200} height={64} lines={["กิจกรรมนักเรียน"]} />
      <FlowBox x={530} y={122} width={200} height={64} lines={["กิจกรรมเพื่อสังคม", "และสาธารณประโยชน์"]} fontSize={17} />

      <polygon points="380,238 480,300 380,362 280,300" fill="url(#activity-flow-strong)" stroke={FLOW_STROKE} strokeWidth={1.5} />
      <text x={380} y={300} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill="#ffffff">
        ประเมิน
      </text>

      <path d="M480 300 H536" stroke={FLOW_STROKE} strokeWidth={1.8} />
      <g>
        <rect x={536} y={226} width={204} height={148} rx={3} fill={FLOW_FILL} stroke={FLOW_STROKE} strokeWidth={2.2} />
        <rect x={540} y={230} width={196} height={140} rx={2} fill="none" stroke={FLOW_STROKE} strokeWidth={0.9} />
        <text x={556} y={256} fontSize={18} fontWeight={800} fill={FLOW_TEXT}>
          เกณฑ์การประเมิน
        </text>
        {[
          { text: "๑. เวลาเข้าร่วมกิจกรรม", indent: 0 },
          { text: "๒. การปฏิบัติกิจกรรม", indent: 0 },
          { text: "๓. ผลงาน/ชิ้นงาน", indent: 0 },
          { text: "คุณลักษณะของผู้เรียน", indent: 20 },
        ].map((line, index) => (
          <text key={line.text} x={556 + line.indent} y={286 + index * 24} fontSize={16} fontWeight={600} fill={FLOW_TEXT}>
            {line.text}
          </text>
        ))}
      </g>

      <path
        d="M42 272 H168 Q184 272 184 288 V312 Q184 328 168 328 H42 Q26 328 26 300 Q26 272 42 272 Z"
        fill={FLOW_SOFT}
        stroke={FLOW_STROKE}
        strokeWidth={1.5}
      />
      <text x={105} y={300} textAnchor="middle" dominantBaseline="central" fontSize={19} fontWeight={800} fill={FLOW_TEXT}>
        ซ่อมเสริม
      </text>

      <g stroke={FLOW_STROKE} strokeWidth={1.8} strokeDasharray="7 6" fill="none">
        <path d="M184 300 H276" markerEnd="url(#activity-flow-arrow)" />
        <path d="M105 392 V332" markerEnd="url(#activity-flow-arrow)" />
        <path d="M380 414 H174" markerEnd="url(#activity-flow-arrow)" />
      </g>
      <FlowBox x={50} y={394} width={120} height={44} lines={["ไม่ผ่าน"]} />
      <text x={276} y={402} textAnchor="middle" fontSize={17} fontWeight={700} fill={FLOW_TEXT}>
        ไม่ตามเกณฑ์
      </text>

      <path d="M380 362 V458" stroke={FLOW_STROKE} strokeWidth={1.8} markerEnd="url(#activity-flow-arrow)" />
      <text x={392} y={444} fontSize={17} fontWeight={700} fill={FLOW_TEXT}>
        ตามเกณฑ์
      </text>
      <FlowBox x={320} y={460} width={120} height={44} lines={["ผ่าน"]} />

      <path d="M380 504 V522" stroke={FLOW_STROKE} strokeWidth={1.8} markerEnd="url(#activity-flow-arrow)" />
      <ellipse cx={380} cy={548} rx={156} ry={27} fill={FLOW_SOFT} stroke={FLOW_STROKE} strokeWidth={1.5} />
      <text x={380} y={548} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={800} fill={FLOW_TEXT}>
        ผลการจัดกิจกรรม
      </text>
    </svg>
  );
}

export function ActivityInstructions3({ header }: InstructionPageProps = {}) {
  return (
    <InstructionPage header={header}>
      <SectionTitle>เกณฑ์การประเมินรายกิจกรรม</SectionTitle>
      <p>การประเมินผลการเข้าร่วมกิจกรรมพัฒนาผู้เรียนนั้น จะต้องผ่านเกณฑ์การประเมินต่อไปนี้</p>
      <Numbered number="1.">
        มีเวลาการเข้าร่วมกิจกรรม ตามเกณฑ์ที่สถานศึกษากำหนดไม่น้อยกว่าร้อยละ 80 ของเวลาเรียนแต่ละกิจกรรม
        สำหรับกิจกรรมเพื่อสังคมและสาธารณประโยชน์ผู้เรียนต้องปฏิบัติกิจกรรมครบตามโครงสร้างเวลาเรียน
      </Numbered>
      <Numbered number="2.">
        มีผลการปฏิบัติกิจกรรมและผลงาน/ชิ้นงาน/คุณลักษณะของผู้เรียนให้เป็นไปตามเกณฑ์ที่สถานศึกษากำหนด
        โดยอาจจัดให้ผู้เรียนแสดงผลงาน แฟ้มสะสมงาน หรือจัดนิทรรศการ
      </Numbered>
      <Numbered number="3.">ผลการประเมินรายภาค/รายปี</Numbered>
      <div className="space-y-1 pl-8">
        <Meaning term="ผ่าน">มีผลการประเมินรายภาค/รายปี ร้อยละ 50 - 100</Meaning>
        <Meaning term="ไม่ผ่าน">มีผลการประเมินรายภาค/รายปี ร้อยละ 0 - 50</Meaning>
      </div>

      <div className="mt-6">
        <ActivityAssessmentFlowchart />
      </div>
    </InstructionPage>
  );
}

export function ActivityInstructions4({ header }: InstructionPageProps = {}) {
  return (
    <InstructionPage header={header}>
      <h1 className="instruction-document-title">คำชี้แจง</h1>
      <SectionTitle>การบันทึกข้อมูลนักเรียนและเวลาเรียน</SectionTitle>
      <div className="pl-6">
        <Numbered number="1.">ให้เขียนบันทึกเวลาเรียนและการบันทึกการประเมินผลการเรียนด้วยหมึกสีดำหรือน้ำเงิน</Numbered>
        <Numbered number="2.">เลขประจำตัวให้กรอกเลขประจำตัวจากน้อยไปหามาก โดยแยกชาย - หญิง</Numbered>
        <Numbered number="3.">เลขประจำตัวประชาชน ให้กรอกเลขประจำตัวประชาชนตามทะเบียนบ้าน หรือสูติบัตรของนักเรียน</Numbered>
        <Numbered number="4.">
          ชื่อ - ชื่อสกุล ให้กรอกชื่อและนามสกุลให้ชัดเจน คำนำหน้านามเขียนให้เต็ม (เด็กชาย,เด็กหญิง)
        </Numbered>
        <Numbered number="5.">
          สัปดาห์ คือสัปดาห์ที่ 1 - 40 ในหนึ่งปีการศึกษา แต่ละสัปดาห์กำหนดไว้ 6 ช่อง สำหรับเลือกลงเวลาเรียน
          คือ กิจกรรม แนะแนว ลูกเสือ-เนตรนารี และชุมนุม
        </Numbered>
        <Numbered number="6.">วันที่ เดือน เขียนให้ชัดเจน</Numbered>
        <Numbered number="7.">การบันทึกเวลาเรียนให้บันทึกรายละเอียด ดังนี้</Numbered>
        <div className="pl-8">
          <Numbered number="7.1">ชั่วโมงที่ให้เขียน 1,2,3....120</Numbered>
          <Numbered number="7.2">
            ผู้มาเรียนให้ทำเครื่องหมาย / ลงในช่องว่าง <BlankBox />
          </Numbered>
          <Numbered number="7.3">
            ผู้ที่ไม่มาเรียนให้เขียน <span className="font-bold text-red-600">ป, ล,</span> หรือ{" "}
            <span className="font-bold text-red-600">ข</span> ด้วยตัวอักษรแดง ลงในช่องว่าง <BlankBox /> แล้วแต่กรณี
          </Numbered>
          <Numbered number="7.4">
            ถ้านักเรียนลาพักการเรียน ขอย้ายหรือย้ายเข้าระหว่างปี ให้ขีดเส้นตรงด้วยหมึกสีแดงจากวันที่ขอพักการเรียน
            ขอย้ายหรือย้ายเข้าจนถึงวันสิ้นปี แล้วเขียนคำ "พักการเรียน" "ขอย้าย" หรือ "ย้ายเข้า" ในช่องนั้นด้วย
            ตามด้วยวันที่แล้วแต่กรณีลงในช่องนั้นด้วย เช่น ..........."ย้ายออก" เมื่อวันที่ ..........................
          </Numbered>
          <Numbered number="7.5">
            รวมจำนวนชั่วโมงเรียน เมื่อสิ้นปีการศึกษาให้รวมเวลาเรียนจริงของนักเรียนลงในช่องรวมเวลาเรียน
            และคิดเวลาเรียนเป็นร้อยละ
          </Numbered>
          <Numbered number="7.6">
            การสรุปผลการประเมิน ถ้านักเรียนได้เวลาเรียน 80 % ขึ้นไปให้เขียนเครื่องหมาย / สีดำ หรือน้ำเงิน
            ในช่องผ่าน ถ้านักเรียนมีเวลาเรียนไม่ถึง 80 % ให้กากบาท <span className="font-bold text-red-600">สีแดง</span>{" "}
            ในช่องไม่ผ่าน
          </Numbered>
          <Numbered number="7.7">
            การบันทึกผลการประเมินตัวชี้วัดในแต่ละกิจกรรมถ้านักเรียน รวมได้ผลการประเมิน "ผ่าน" ให้ทำเครื่องหมาย /
            ในช่อง "ผ" ถ้านักเรียนไม่ผ่าน ให้ทำเครื่องหมาย / ในช่อง "มผ"
          </Numbered>
          <Numbered number="7.8">
            การสรุปผลการประเมินการตัดสินผลการเรียนของแต่ละกิจกรรม ถ้านักเรียน ผ่าน ให้เขียน "ผ่าน"
            ถ้าไม่ผ่านให้เขียน "ไม่ผ่าน"
          </Numbered>
        </div>
      </div>
    </InstructionPage>
  );
}

const INSTRUCTION_PAGES = [
  {
    title: "คำชี้แจง 1",
    subtitle: "การประเมินกิจกรรมพัฒนาผู้เรียน",
    icon: FileText,
    active: "border-sky-400 bg-gradient-to-br from-sky-50 to-white shadow-[0_10px_24px_-14px_rgba(2,132,199,0.55)]",
    iconBox: "bg-sky-600 shadow-sky-200",
    ring: "focus-visible:ring-sky-200",
    Page: ActivityInstructions1,
  },
  {
    title: "คำชี้แจง 2",
    subtitle: "เกณฑ์การตัดสิน",
    icon: Scale,
    active: "border-amber-400 bg-gradient-to-br from-amber-50 to-white shadow-[0_10px_24px_-14px_rgba(217,119,6,0.55)]",
    iconBox: "bg-amber-500 shadow-amber-200",
    ring: "focus-visible:ring-amber-200",
    Page: ActivityInstructions2,
  },
  {
    title: "คำชี้แจง 3",
    subtitle: "เกณฑ์การประเมินรายกิจกรรม",
    icon: ClipboardCheck,
    active: "border-emerald-400 bg-gradient-to-br from-emerald-50 to-white shadow-[0_10px_24px_-14px_rgba(5,150,105,0.55)]",
    iconBox: "bg-emerald-600 shadow-emerald-200",
    ring: "focus-visible:ring-emerald-200",
    Page: ActivityInstructions3,
  },
  {
    title: "คำชี้แจง 4",
    subtitle: "การบันทึกข้อมูลนักเรียนและเวลาเรียน",
    icon: UserRoundPen,
    active: "border-violet-400 bg-gradient-to-br from-violet-50 to-white shadow-[0_10px_24px_-14px_rgba(124,58,237,0.55)]",
    iconBox: "bg-violet-600 shadow-violet-200",
    ring: "focus-visible:ring-violet-200",
    Page: ActivityInstructions4,
  },
];

/** แท็บคำชี้แจง: เลือกหน้าย่อย 1-4 ด้วยปุ่มใหญ่ด้านบน */
export function ActivityInstructionsTab() {
  const [pageIndex, setPageIndex] = useState(0);
  const current = INSTRUCTION_PAGES[pageIndex];
  const switcher = (
    <div className="grid w-full max-w-[1123px] gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="หน้าคำชี้แจง">
      {INSTRUCTION_PAGES.map((page, index) => {
        const Icon = page.icon;
        const selected = index === pageIndex;
        return (
          <button
            key={page.title}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setPageIndex(index)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition duration-150 focus:outline-none focus-visible:ring-4 ${page.ring} ${
              selected ? page.active : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-lg ${
                selected ? page.iconBox : "bg-slate-400 shadow-slate-200"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-lg font-extrabold leading-6 ${selected ? "text-slate-900" : "text-slate-600"}`}>
                {page.title}
              </span>
              <span className="mt-0.5 block text-sm leading-5 text-slate-500">{page.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
  const Page = current.Page;
  return <Page header={switcher} />;
}
