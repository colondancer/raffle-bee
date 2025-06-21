export function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}-Q${quarter}`;
}

export function getQuarterEndDate(period) {
  const [year, quarter] = period.split('-Q');
  const quarterNum = parseInt(quarter);
  const quarterEndMonth = quarterNum * 3;
  return new Date(parseInt(year), quarterEndMonth, 0); // Last day of quarter
}

export function formatPeriod(period) {
  const [year, quarter] = period.split('-Q');
  const quarters = {
    1: 'Q1 (Jan-Mar)',
    2: 'Q2 (Apr-Jun)', 
    3: 'Q3 (Jul-Sep)',
    4: 'Q4 (Oct-Dec)'
  };
  return `${year} ${quarters[quarter]}`;
}