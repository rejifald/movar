import { describe, expect, it } from 'vitest';
import { parseRobots, robotsAllows } from './probe';

describe('robots.txt', () => {
  const ROBOTS = `
    User-agent: BadBot
    Disallow: /

    User-agent: *
    Disallow: /private
    Allow: /private/public
  `;

  it('reads the wildcard group, not another agent’s', () => {
    const rules = parseRobots(ROBOTS);
    expect(rules.disallow).toContain('/private');
    expect(robotsAllows(rules, '/anything')).toBe(true);
  });

  it('disallows a matching prefix', () => {
    expect(robotsAllows(parseRobots(ROBOTS), '/private/thing')).toBe(false);
  });

  it('lets a longer Allow win over a shorter Disallow', () => {
    expect(robotsAllows(parseRobots(ROBOTS), '/private/public/page')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobots('# comment\n\nUser-agent: *\nDisallow: /x # trailing');
    expect(rules.disallow).toEqual(['/x']);
  });

  it('expands a * inside a Disallow pattern', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*/private');
    expect(robotsAllows(rules, '/uk/private')).toBe(false);
    expect(robotsAllows(rules, '/uk/private/deep')).toBe(false);
    expect(robotsAllows(rules, '/uk/public')).toBe(true);
  });

  it('anchors a Disallow pattern ending in $ to the end of the path', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.json$');
    expect(robotsAllows(rules, '/data.json')).toBe(false);
    expect(robotsAllows(rules, '/a/b/data.json')).toBe(false);
    expect(robotsAllows(rules, '/data.json.html')).toBe(true);
  });

  it('anchors the start of a $-terminated pattern too', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /data.json$');
    expect(robotsAllows(rules, '/data.json')).toBe(false);
    expect(robotsAllows(rules, '/a/data.json')).toBe(true);
  });

  it('honours the query-string idiom Disallow: /*?', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*?');
    expect(robotsAllows(rules, '/search?q=1')).toBe(false);
    expect(robotsAllows(rules, '/search')).toBe(true);
  });

  it('matches every other pattern character literally', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a.b(c)+d');
    expect(robotsAllows(rules, '/a.b(c)+d')).toBe(false);
    expect(robotsAllows(rules, '/axb(c)d')).toBe(true);
    expect(robotsAllows(rules, '/a.bccd')).toBe(true);
  });

  it('keeps longest-pattern-wins when the longer pattern holds a wildcard', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/*/public');
    expect(robotsAllows(rules, '/private/uk/public')).toBe(true);
    expect(robotsAllows(rules, '/private/uk/other')).toBe(false);
  });

  it('reads a group whose consecutive user-agent lines start with the wildcard', () => {
    const rules = parseRobots('User-agent: *\nUser-agent: Googlebot\nDisallow: /private');
    expect(rules.disallow).toEqual(['/private']);
    expect(robotsAllows(rules, '/private/thing')).toBe(false);
  });

  it('reads consecutive user-agent lines the same way in either order', () => {
    const wildcardFirst = parseRobots('User-agent: *\nUser-agent: Googlebot\nDisallow: /private');
    const wildcardLast = parseRobots('User-agent: Googlebot\nUser-agent: *\nDisallow: /private');
    expect(wildcardFirst).toEqual(wildcardLast);
  });

  it('starts a new group at the first user-agent line after a rule', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /a\n\nUser-agent: BadBot\nUser-agent: OtherBot\nDisallow: /b',
    );
    expect(rules.disallow).toEqual(['/a']);
  });
});
