const mailbox = ['stefan', 'mueller'].join('.');
const domain = ['mullzk', 'ch'].join('.');
const contactAddress = `${mailbox}@${domain}`;

export const contactLink = () => ({
  label: contactAddress,
  href: `mailto:${contactAddress}`,
});
