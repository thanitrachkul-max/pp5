// Deterministic, synthetic data only. This client never opens a network connection.
export function browserFixture() {
  const teacher = { id: 'teacher', full_name: 'ครูทดสอบ', title: 'นาย', username: 'test', role: 'teacher', is_active: true };
  const year = { id: 'year', school_id: 'school', year_be: 2569, is_active: true, workspace_status: 'active' };
  const semester = { id: 'term', academic_year_id: 'year', semester_number: 1, is_active: true, grade_entry_enabled: true, academic_years: year };
  const classrooms = Array.from({ length: 4 }, (_, i) => ({ id: `room${i}`, school_id: 'school', academic_year_id: 'year', name: `ม.6/${i + 1}`, class_level_code: 'ม.6', room_number: i + 1 }));
  const students = Array.from({ length: 30 }, (_, i) => ({ id: `student${i}`, studentId: `69${i}`, name: `นักเรียน ทดสอบ${i}`, studentNumber: i + 1 }));
  const config = { learningArea: 'วิทยาศาสตร์และเทคโนโลยี', subjectName: 'วิทยาศาสตร์', storedScore: 70, units: [{ name: 'หน่วยทดสอบ', indicators: [{ code: 'ว 1.1 ม.6/1', fullScore: 70, passingScore: 35 }] }], selectedIndicators: ['ว 1.1 ม.6/1'] };
  const gradebooks = Array.from({ length: 12 }, (_, i) => ({
    id: `book${i}`, teaching_assignment_id: `assignment${i}`, assignment_group_id: `group${i}`, semester_id: 'term', teacher_id: 'teacher', deleted_at: null,
    status: 'completed', approval_status: 'approved', stats: { completionPercent: 100, studentCount: 30 }, students,
    scores: Object.fromEntries(students.map(s => [s.id, { u0_i0: 60, midterm: 8, final: 15 }])), score_config: config,
    attendance: { records: Object.fromEntries(students.map(s => [s.id, Object.fromEntries(Array.from({ length: 100 }, (_, n) => [`day${n}`, '/']))])) },
    attributes: {}, analytical: {}, indicators: [], general_info: { gradeLevel: 'ม.6/1', teacherName: 'นาย ครูทดสอบ' },
  }));
  const assignments = gradebooks.map((book, i) => ({ id: book.teaching_assignment_id, assignment_group_id: book.assignment_group_id, school_id: 'school', teacher_id: 'teacher', semester_id: 'term', classroom_id: classrooms[i % 4].id, subject_id: `subject${i}`, status: 'active', hours_per_week: 1, hours_per_semester: 20, classrooms: classrooms[i % 4], schools: { name: 'โรงเรียนทดสอบ' }, profiles: teacher, semesters: semester, subjects: { id: `subject${i}`, subject_code: `ว33${String(i).padStart(3, '0')}`, subject_name: 'วิทยาศาสตร์', learning_area: 'วิทยาศาสตร์และเทคโนโลยี' }, gradebooks: [book] }));
  const enrollments = classrooms.flatMap(room => students.map(s => ({ id: `${room.id}-${s.id}`, classroom_id: room.id, academic_year_id: 'year', class_level_code: 'ม.6', status: 'active', student_number: s.studentNumber, students: { id: s.id, student_code: s.studentId, first_name: 'นักเรียน', last_name: s.name, title: 'นาย' } })));
  const tables = { teaching_assignments: assignments, gradebooks, academic_years: [year], semesters: [semester], classrooms, profiles: [teacher], subjects: assignments.map(a => a.subjects), student_enrollments: enrollments, class_levels: [{ code: 'ม.6', name: 'มัธยมศึกษาปีที่ 6', sequence: 12, stage: 'secondary' }] };
  const channels = new Set();
  const perf = window.__perf = { requests: [], active: 0, peak: 0, delay: 0, rpcMissing: false, opened: false, errors: [], renders: {} };
  perf.emit = (table, row = {}) => {
    for (const channel of channels) for (const [filter, callback] of channel.listeners) if (filter.table === table) callback({ new: row });
  };
  perf.setApproval = (status) => { gradebooks[0].approval_status = status; perf.emit('gradebooks', { ...gradebooks[0] }); };
  class Query {
    constructor(table, rpcArgs) { this.table = table; this.rpcArgs = rpcArgs; this.filters = []; this.columns = '*'; }
    select(columns = '*', options = {}) { this.columns = columns; this.options = options; return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this; }
    or(value) { this.orFilter = value; return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    async execute() {
      perf.active++; perf.peak = Math.max(perf.peak, perf.active);
      try {
        if (perf.delay) await new Promise(resolve => setTimeout(resolve, perf.delay));
        let rows = (tables[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)));
        let error = null;
        if (this.table === 'count_active_enrollments') {
          if (perf.rpcMissing) error = { code: 'PGRST202', message: 'Could not find count_active_enrollments in schema cache' };
          else rows = classrooms.filter(room => this.rpcArgs.p_classroom_ids.includes(room.id)).map(room => ({ classroom_id: room.id, academic_year_id: 'year', student_count: 30 }));
        }
        if (this.table === 'get_pap5_official_names') rows = [{}];
        rows = structuredClone(rows);
        if (this.table === 'gradebooks' && this.columns !== '*') {
          const fields = this.columns.split(',').map(s => s.trim());
          rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => fields.includes(key))));
        }
        if (this.table === 'teaching_assignments' && this.columns.includes('gradebooks(') && !this.columns.includes('students, scores')) {
          for (const row of rows) row.gradebooks = row.gradebooks.map(({ id, status, stats, approval_status }) => ({ id, status, stats, approval_status }));
        }
        const data = this.options?.head ? null : this.one ? rows[0] ?? null : rows;
        const result = { data, count: rows.length, error };
        perf.requests.push({ table: this.table, columns: this.columns, count: rows.length, bytes: JSON.stringify(result).length, or: this.orFilter });
        return result;
      } finally { perf.active--; }
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  return {
    from: table => new Query(table), rpc: (name, args) => new Query(name, args),
    channel() { const channel = { listeners: [], on(_event, filter, callback) { this.listeners.push([filter, callback]); return this; }, subscribe() { channels.add(this); return this; } }; return channel; },
    removeChannel: channel => channels.delete(channel),
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  };
}
