import { Pap5CoverPreview } from "../../components/Pap5CoverPreview";
import type { AppData } from "../../types";

const students = [
  ["1", "2316", "1209000788184", "เด็กชาย วีระพล วงษ์ขันธ์"],
  ["2", "2027", "1139600705256", "เด็กชาย ปกรณ์ ศรีสมศักดิ์"],
  ["3", "2133", "1139600721987", "เด็กชาย ธนภัทร พรมคำบุตร"],
  ["4", "2143", "1819900925638", "เด็กชาย สุกลวัฒน์ ฮาตตา"],
  ["5", "2372", "1219901517628", "เด็กชาย ณัฐนนท์ รักษะคุ"],
  ["6", "6934", "1417300087706", "เด็กหญิง ชยพล สอนบัว"],
  ["7", "6935", "1350800371114", "เด็กชาย ปณชัย ทิพย์สิงห์"],
  ["8", "6911", "1508700128914", "เด็กชาย ดนัย จะปา"],
].map(([id, studentId, citizenId, name]) => ({ id, studentId, citizenId, name }));

const scoreTotals = [86, 78, 72, 70, 82, 88, 83, 81];
const scores = Object.fromEntries(
  students.map((student, index) => [student.id, { u0_i0: scoreTotals[index] }]),
);

const analytical = Object.fromEntries(
  students.map((student, index) => [
    student.id,
    {
      attr1: index < 6 ? 3 : 2,
      attr2: index < 6 ? 3 : 2,
      attr3: index < 6 ? 3 : 2,
      attr4: index < 6 ? 3 : 2,
      attr5: index < 6 ? 3 : 2,
      attr6: index < 6 ? 3 : 2,
      attr7: index < 6 ? 3 : 2,
    },
  ]),
);

const attributeKeys = [
  "attr1_1",
  "attr1_2",
  "attr1_3",
  "attr1_4",
  "attr2_1",
  "attr2_2",
  "attr3_1",
  "attr3_2",
  "attr4_1",
  "attr4_2",
  "attr5_1",
  "attr5_2",
  "attr6_1",
  "attr6_2",
  "attr7_1",
  "attr7_2",
  "attr7_3",
  "attr8_1",
  "attr8_2",
];

const attributes = Object.fromEntries(
  students.map((student, index) => [
    student.id,
    Object.fromEntries(attributeKeys.map((key) => [key, index < 3 ? 3 : 2])),
  ]),
);

const sampleData: AppData = {
  generalInfo: {
    schoolName: "โรงเรียนกาฬสินธุ์ปัญญานุกูล",
    agencyName: "สำนักบริหารงานการศึกษาพิเศษ",
    logoUrl: "/logo3.png",
    gradeLevel: "ม.1/4",
    semester: "1",
    academicYear: "2569",
    subjectCode: "ส21101",
    subjectName: "สังคมศึกษา ศาสนา และวัฒนธรรม",
    learningArea: "สังคมศึกษา ศาสนา และวัฒนธรรม",
    totalHours: "1",
    hoursPerWeek: "1",
    hoursPerSemester: "20",
    teacherName: "ธนัท ธนพัฒน์ธัชกุล",
    teacherName2: "",
    teacherName3: "",
    homeroomTeacher1: "นายธนัท ธนพัฒน์ธัชกุล",
    homeroomTeacher2: "นาย ธนัท ธนพัฒน์ธัชกุล",
    homeroomTeacher3: "นางธีราพร เจริญยิ่ง",
    homeroomTeachers: "",
    headOfLearningArea: "นางสาว ประภาวดี ศรีทับ",
    headOfEvaluation: "นางสาว ประภาวดี ศรีทับ",
    deputyDirector: "นางสาว อัจฉราภรณ์ เศษวิ",
    schoolDirector: "นาย มีเกียรติ นาสมตรีก",
    approvalDate: "2026-06-28",
    studyStartDate: "2026-05-16",
    studyEndDate: "2026-09-30",
  },
  students,
  attendance: {},
  scores,
  scoreConfig: {
    learningArea: "สังคมศึกษา ศาสนา และวัฒนธรรม",
    subjectName: "สังคมศึกษา ศาสนา และวัฒนธรรม",
    subjectCode: "ส21101",
    standard: "",
    selectedIndicators: [],
    storedScore: 100,
    units: [
      {
        name: "หน่วยที่ 1",
        indicators: [{ code: "ส 2.1 ม.1/1", fullScore: 100, passingScore: 50 }],
      },
    ],
  },
  attributes,
  analytical,
  indicators: [{ id: "i1", description: "อธิบายบทบาทหน้าที่ของเยาวชนที่มีต่อสังคม" }],
};

export function Pap5CoverPreviewPage() {
  return (
    <main className="pap5-preview-route-root min-h-screen bg-slate-100 py-6">
      <div className="pap5-print-root">
        <Pap5CoverPreview
          data={sampleData.generalInfo}
          appData={sampleData}
          approvalStatus="pending"
          mode="print"
        />
      </div>
    </main>
  );
}
