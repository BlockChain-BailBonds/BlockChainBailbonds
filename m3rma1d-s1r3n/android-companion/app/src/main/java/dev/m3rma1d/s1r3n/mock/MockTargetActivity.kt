package dev.m3rma1d.s1r3n.mock

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MockTargetActivity : ComponentActivity() {
    private var reportedSuccess by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Column(modifier = Modifier.padding(24.dp)) {
                    Button(onClick = {}) { Text("Connect") }
                    Button(onClick = {}) { Text("Choose firmware") }
                    Button(onClick = { reportedSuccess = true }) { Text("Flash") }
                    OutlinedButton(onClick = { reportedSuccess = false }) { Text("Cancel") }
                    if (reportedSuccess) Text("Reported success")
                }
            }
        }
    }
}
