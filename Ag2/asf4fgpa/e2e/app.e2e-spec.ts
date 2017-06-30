import { Asf4fgpaPage } from './app.po';

describe('asf4fgpa App', () => {
  let page: Asf4fgpaPage;

  beforeEach(() => {
    page = new Asf4fgpaPage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!!');
  });
});
