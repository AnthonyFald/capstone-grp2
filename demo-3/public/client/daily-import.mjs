export const DAILY_REPORT_TEXT_LIMIT = 5000;

export function dailyReportFromDocument({id, date, area, text}) {
  const reportId = id.trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(reportId)) throw Error('Use a report ID with up to 40 letters, numbers, dashes, or underscores.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw Error('Enter the date shown on the report.');
  }
  if (!text.trim() || text.includes('\0')) throw Error('Provide readable daily report text.');
  if (text.length > DAILY_REPORT_TEXT_LIMIT) throw Error('Shorten the report text to 5,000 characters. You can submit another excerpt as a separate report.');
  return {report_id:reportId, report_date:date, work_area:area.trim(), issue_or_update:text};
}
