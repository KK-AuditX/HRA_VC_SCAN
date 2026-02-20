
import { ContactInfo } from "../types";

/**
 * Service to handle Google Cloud interactions.
 * In a real-world scenario, the accessToken would be obtained via Google Identity Services.
 */

export async function pushToGoogleContacts(contact: ContactInfo, accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://people.googleapis.com/v1/people:createContact', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        names: [{ givenName: contact.name }],
        organizations: [{ name: contact.firmName, title: contact.jobTitle }],
        phoneNumbers: [{ value: contact.phone, type: 'work' }],
        emailAddresses: [{ value: contact.email, type: 'work' }],
        urls: [{ value: contact.website, type: 'work' }],
        addresses: [{ streetAddress: contact.address, type: 'work' }],
        notes: contact.notes
      })
    });
    return response.ok;
  } catch (error) {
    console.error("Error pushing to Google Contacts:", error);
    return false;
  }
}

export async function pushToGoogleSheets(contact: ContactInfo, accessToken: string, spreadsheetId: string = 'me'): Promise<boolean> {
  // Note: 'me' is a placeholder. Typically you'd create or find a spreadsheet named 'KK-SmartScan Database'
  try {
    const range = 'Sheet1!A:I';
    const values = [[
      contact.name,
      contact.firmName,
      contact.jobTitle,
      contact.email,
      contact.phone,
      contact.industry,
      contact.website,
      contact.address,
      new Date(contact.createdAt).toISOString()
    ]];

    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values })
    });
    return response.ok;
  } catch (error) {
    console.error("Error pushing to Google Sheets:", error);
    return false;
  }
}
