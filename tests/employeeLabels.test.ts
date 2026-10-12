import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmployeeDisplayLabel, computeAllDisplayLabels } from '../src/utils/employeeDisplay.ts';

test('getEmployeeDisplayLabel returns plain name when unique', () => {
  const all = [
    { id: 'emp-1', name: 'Alice Smith', department: 'Engineering', location: 'New York' },
    { id: 'emp-2', name: 'Bob Jones', department: 'Product', location: 'San Francisco' }
  ];
  assert.equal(getEmployeeDisplayLabel(all[0], all), 'Alice Smith');
  assert.equal(getEmployeeDisplayLabel(all[1], all), 'Bob Jones');
});

test('getEmployeeDisplayLabel disambiguates with (Department, City) when names match', () => {
  const all = [
    { id: 'emp-1', name: 'Alex Chen', department: 'Engineering', location: 'Remote' },
    { id: 'emp-2', name: 'Alex Chen', department: 'Finance', location: 'London' },
    { id: 'emp-3', name: 'David Miller', department: 'Product', location: 'Berlin' }
  ];
  assert.equal(getEmployeeDisplayLabel(all[0], all), 'Alex Chen (Engineering, Remote)');
  assert.equal(getEmployeeDisplayLabel(all[1], all), 'Alex Chen (Finance, London)');
  assert.equal(getEmployeeDisplayLabel(all[2], all), 'David Miller');
});

test('getEmployeeDisplayLabel appends id suffix if department and city are identical', () => {
  const all = [
    { id: 'emp-741237', name: 'MAN12', department: 'Engineering', location: 'Remote' },
    { id: 'emp-043025', name: 'MAN12', department: 'Engineering', location: 'Remote' }
  ];
  const lbl1 = getEmployeeDisplayLabel(all[0], all);
  const lbl2 = getEmployeeDisplayLabel(all[1], all);

  assert.notEqual(lbl1, lbl2);
  assert.equal(lbl1, 'MAN12 (Engineering, Remote) - 1237');
  assert.equal(lbl2, 'MAN12 (Engineering, Remote) - 3025');
});

test('computeAllDisplayLabels produces strictly unique display_label for all items', () => {
  const all = [
    { id: 'emp-741237', name: 'MAN12', department: 'Cloud & Infrastructure', location: 'Remote' },
    { id: 'emp-043025', name: 'MAN12', department: 'Engineering', location: 'Remote' },
    { id: 'emp-1', name: 'Sarah Connor', department: 'Security', location: 'Austin' }
  ];
  const labeled = computeAllDisplayLabels(all);
  const labels = labeled.map(l => l.display_label);

  assert.equal(new Set(labels).size, labels.length);
  assert.equal(labeled[0].display_label, 'MAN12 (Cloud & Infrastructure, Remote)');
  assert.equal(labeled[1].display_label, 'MAN12 (Engineering, Remote)');
  assert.equal(labeled[2].display_label, 'Sarah Connor');
});
