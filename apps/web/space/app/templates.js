// Templates written for Nemesis. "Use template" copies one into Private as ordinary pages, blocks and databases, so a
// copy saves, syncs and shares like anything else. Field-agnostic on purpose (CLAUDE.md): each has to make sense for a
// law student and a mechanical engineering student alike, so none of them names a subject.
//
// A page template is a list of blocks: [type, text, extra]. A database template is its properties and example rows.
export const TEMPLATES = [
  {
    id: 'course-notes',
    title: 'Course notes',
    icon: '📓',
    description: 'One page per class: the main ideas, the terms, and what to review.',
    page: {
      blocks: [
        ['sub_header', 'This week'],
        ['bulleted_list', 'The main idea from class'],
        ['bulleted_list', 'Something to ask next time'],
        ['sub_header', 'Key terms'],
        ['table', '', { rows: [['Term', 'What it means'], ['', ''], ['', '']], headerRow: true, widths: [180, 320] }],
        ['sub_header', 'Review'],
        ['to_do', 'Explain the main idea out loud without notes', { checked: false }],
        ['to_do', 'Write three questions an exam could ask about it', { checked: false }],
      ],
    },
  },
  {
    id: 'reading-list',
    title: 'Reading list',
    icon: '📚',
    description: 'Everything assigned, who wrote it, when it is due and how far you are.',
    database: {
      view: 'table',
      props: [['Author', 'text'], ['Status', 'status'], ['Due', 'date'], ['Pages', 'number']],
      rows: [{ title: 'First assigned reading', Status: 'Not started' }, { title: 'Chapter for next week', Status: 'Not started' }],
    },
  },
  {
    id: 'assignments',
    title: 'Assignment tracker',
    icon: '🗂️',
    description: 'A board of everything due, moved across as you work on it.',
    database: {
      view: 'board',
      props: [['Status', 'status'], ['Course', 'select'], ['Due', 'date']],
      rows: [{ title: 'Weekly response', Status: 'Not started' }, { title: 'Group presentation', Status: 'In progress' }, { title: 'Final paper', Status: 'Not started' }],
    },
  },
  {
    id: 'exam-prep',
    title: 'Exam prep plan',
    icon: '🎯',
    description: 'What the exam covers, a day-by-day plan, and a check that you can recall it.',
    page: {
      blocks: [
        ['sub_header', 'What the exam covers'],
        ['bulleted_list', 'Topic'],
        ['bulleted_list', 'Topic'],
        ['sub_header', 'Plan'],
        ['table', '', { rows: [['Day', 'What to cover', 'Done'], ['', '', ''], ['', '', '']], headerRow: true, widths: [120, 300, 80] }],
        ['sub_header', 'Before the exam'],
        ['to_do', 'Answer past questions with the book closed', { checked: false }],
        ['to_do', 'Mark what you got wrong and go back over only that', { checked: false }],
        ['callout', 'Test yourself before you reread. Recalling it is what makes it stick.', { icon: '💡' }],
      ],
    },
  },
  {
    id: 'group-project',
    title: 'Group project hub',
    icon: '🤝',
    description: 'The goal, who is doing what, and notes from each meeting. Share it with your group.',
    page: {
      blocks: [
        ['sub_header', 'Goal'],
        ['text', 'What the finished project is, in one or two sentences.'],
        ['sub_header', 'Who does what'],
        ['table', '', { rows: [['Person', 'Part', 'Due'], ['', '', ''], ['', '', '']], headerRow: true, widths: [160, 260, 120] }],
        ['sub_header', 'Meeting notes'],
        ['to_do', 'Agree on the outline', { checked: false }],
        ['to_do', 'Set the next meeting', { checked: false }],
      ],
    },
  },
  {
    id: 'weekly-planner',
    title: 'Weekly planner',
    icon: '🗓️',
    description: 'A short list for each day, so the week fits on one page.',
    page: {
      blocks: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend'].flatMap((day) => [
        ['sub_sub_header', day],
        ['to_do', '', { checked: false }],
      ]),
    },
  },
];
